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

// ── Auto-indexing ──────────────────────────────────────────────────────────
// Mongoose auto-creates every schema-declared index on connect when
// `autoIndex` is true. That's convenient in development — a schema change
// immediately builds its index with zero ceremony. In production it's a
// footgun on serverless (Vercel):
//
//   • Any function instance can be the first to boot after a deploy, so index
//     creation becomes a race instead of a controlled, single deploy step.
//   • Creating a unique / TTL index opportunistically on a hot path can fail
//     or lock the collection at the worst possible moment.
//
// So production defaults to `autoIndex: false`: indexes are built explicitly by
// scripts/create-indexes.js as part of the deploy (see README → Deploy).
// Local development keeps `autoIndex: true` so schema changes just work.
//
// Override the per-environment default with the AUTO_INDEX env var
// ("true"/"1"/"false"/"0") when a given environment needs the opposite.
const AUTO_INDEX_DEFAULT = process.env.NODE_ENV !== "production";

function envBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === "") return fallback;
  return !/^(false|0|off|no)$/i.test(value.trim());
}

const AUTO_INDEX = envBool(process.env.AUTO_INDEX, AUTO_INDEX_DEFAULT);

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
      // Off in production (indexes built explicitly by scripts/create-indexes.js
      // at deploy time); on in development so schema changes just work.
      autoIndex: AUTO_INDEX,
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
