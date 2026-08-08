import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI as string;

if (!MONGODB_URI) {
  throw new Error("Please define the MONGODB_URI environment variable in .env");
}

// ── Connection pool sizing ──────────────────────────────────────────────
// Serverless functions are single-threaded per invocation — each request
// only needs 1 active connection at a time. A large pool per instance
// wastes MongoDB connections and exhausts the Atlas limit under load.
//
// M0  free tier: 500  connections → 500 / 5  = 100 concurrent cold starts
// M2  shared:    500  connections → 500 / 5  = 100 concurrent cold starts
// M5  shared:  1,500  connections → 1500 / 5 = 300 concurrent cold starts
//
// The environment variable lets you override for dedicated clusters (M10+).
const DB_POOL_SIZE = parseInt(process.env.DB_POOL_SIZE || "5", 10);

// Reuse the connection across hot reloads / serverless invocations.
// Vercel keeps function instances warm (alive in memory) between requests,
// so `global` caching avoids reconnecting on every invocation.
let cached = (global as any).mongoose;

if (!cached) {
  cached = (global as any).mongoose = {
    conn: null,
    promise: null,
    readyCount: 0,
  };
}

export async function connectDB() {
  if (cached.conn) {
    // Connection is already open — reused from a previous warm invocation.
    return cached.conn;
  }

  if (!cached.promise) {
    const opts: mongoose.ConnectOptions = {
      bufferCommands: false,
      // ── Pool tuning for serverless ──────────────────────────────────
      maxPoolSize: DB_POOL_SIZE,
      minPoolSize: 1,
      // ── Timeouts tuned for serverless (Vercel has a 60 s max) ──────
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
      socketTimeoutMS: 45000, // just under the 60 s function limit
      // ── Keep-alive to avoid idle disconnects on warm instances ──────
      heartbeatFrequencyMS: 10000,
    };

    cached.promise = mongoose
      .connect(MONGODB_URI, opts)
      .then((mongoose) => mongoose);
  }

  try {
    cached.conn = await cached.promise;
    cached.readyCount = (cached.readyCount || 0) + 1;
  } catch (e) {
    // If the connection fails, reset the promise so the next invocation
    // can retry instead of hanging on a rejected promise forever.
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

/** Returns the number of times connectDB() resolved successfully (for health checks). */
export function getDBReadyCount(): number {
  return cached?.readyCount ?? 0;
}

/** Returns the current connection pool size (connections checked out + idle). */
export function getDBPoolSize(): { current: number; available: number } | null {
  if (!cached?.conn) return null;
  const base = (cached.conn.connection as any)?.base;
  if (!base) return null;
  return {
    current: base.connections?.length ?? 0,
    available: base.pools?.size ?? 0,
  };
}
