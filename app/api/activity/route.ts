import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import { requireApprovedUser, authFailureResponse } from "@/lib/auth";
import { queryActivityLogs } from "@/lib/activity";

// GET /api/activity?action=&q=&actorId=&from=&to=&page=&limit=
// Activity/audit feed. Requires an approved admin token (Bearer).
export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return authFailureResponse(auth);
  }
  if (auth.user!.role !== "admin") {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  }

  try {
    const sp = req.nextUrl.searchParams;
    const result = await queryActivityLogs({
      action: sp.get("action") || undefined,
      q: sp.get("q") || undefined,
      actorId: sp.get("actorId") || undefined,
      from: sp.get("from") || undefined,
      to: sp.get("to") || undefined,
      page: sp.get("page") ? Number(sp.get("page")) : undefined,
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}
