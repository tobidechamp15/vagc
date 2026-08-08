import { connectDB, getDBReadyCount, getDBPoolSize } from "@/lib/mongodb";

// GET /api/health
// Lightweight health check for monitoring and load-balancer probes.
// Reports MongoDB connection state and pool usage so you can verify
// that the serverless → MongoDB bridge is healthy after scaling out.
export async function GET() {
  const started = Date.now();

  try {
    const conn = await connectDB();

    // readyState: 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
    const readyState = conn.connection.readyState;
    const pool = getDBPoolSize();

    // Fetch server-side connection metrics from MongoDB itself.
    let serverConnections: number | null = null;
    let serverAvailable: number | null = null;
    try {
      const adminDb = conn.connection.db!.admin();
      const status = await adminDb.serverStatus();
      serverConnections = status.connections?.current ?? null;
      serverAvailable = status.connections?.available ?? null;
    } catch {
      // serverStatus requires admin privileges — skip if not available
    }

    const healthy = readyState === 1;

    return Response.json(
      {
        status: healthy ? "ok" : "degraded",
        uptime: Date.now() - started,
        mongo: {
          readyState,
          readyStateLabel:
            ["disconnected", "connected", "connecting", "disconnecting"][
              readyState
            ] ?? "unknown",
          // Per-instance pool (this Vercel function's view)
          localPool: pool,
          // MongoDB Atlas cluster-wide connection count
          serverConnections,
          serverAvailable,
        },
        connectCount: getDBReadyCount(),
      },
      { status: healthy ? 200 : 503 },
    );
  } catch (err: any) {
    return Response.json(
      {
        status: "error",
        uptime: Date.now() - started,
        error: err.message,
      },
      { status: 503 },
    );
  }
}
