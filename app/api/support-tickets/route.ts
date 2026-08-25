import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import SupportTicket, { SupportTicketStatus } from "@/models/SupportTicket";
import { requireApprovedUser, authFailureResponse } from "@/lib/auth";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rateLimit";

// Users allowed to view/triage support tickets. Matches the other management
// gates (posts, events, prayer-requests) — any approved admin/staff account.
const MODERATOR_ROLES = ["admin", "staff"];

const TICKET_STATUSES: SupportTicketStatus[] = [
  "open",
  "in_progress",
  "resolved",
];

// POST /api/support-tickets -> submit a support ticket (public, no auth).
//
// The app is anonymous-first (most of it has no login), so anyone — logged-in
// or not — can report a problem. The submitter is tracked by deviceId (or
// userId when a signed-in admin/staff reports via the app). Public writes are
// rate-limited per IP exactly like prayer-request submission (DEV-21/DEV-30):
// throttling happens before any validation/DB work.
export async function POST(req: NextRequest) {
  try {
    // DEV-30: public write — throttle submissions per IP so the queue can't be
    // spammed. Each ticket is also length-capped below.
    const rl = await checkRateLimit(req, {
      key: "support-tickets.submit",
      ...RATE_LIMITS.supportSubmit,
    });
    if (!rl.ok) return rateLimitResponse(rl.retryAfterSeconds);

    await connectDB();
    const body = await req.json().catch(() => ({}));

    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const deviceId =
      typeof body.deviceId === "string" ? body.deviceId.trim() : "";
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    const screenContext =
      typeof body.screenContext === "string" ? body.screenContext.trim() : "";

    if (!subject) {
      return NextResponse.json(
        { success: false, error: "subject is required" },
        { status: 400 },
      );
    }
    if (!message) {
      return NextResponse.json(
        { success: false, error: "message is required" },
        { status: 400 },
      );
    }
    if (subject.length > 200) {
      return NextResponse.json(
        { success: false, error: "subject must be 200 characters or fewer" },
        { status: 400 },
      );
    }
    if (message.length > 2000) {
      return NextResponse.json(
        { success: false, error: "message must be 2000 characters or fewer" },
        { status: 400 },
      );
    }

    // deviceId is the primary submitter identity for the anonymous app; userId
    // is only set when a signed-in account reports (rare admin/staff path).
    const ticket = await SupportTicket.create({
      deviceId: deviceId || null,
      userId: userId || null,
      subject,
      message,
      screenContext: screenContext || null,
      status: "open",
    });

    return NextResponse.json({ success: true, data: ticket }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}

// GET /api/support-tickets                     -> admin triage list (paginated)
// GET /api/support-tickets?status=open         -> filter by status
// GET /api/support-tickets?page=2&limit=20     -> paginate (page 1-based)
// Admin-only: approved admin/staff accounts can list/triage every ticket.
// Returns 401 for missing/invalid tokens and 403 for non-moderator accounts.
export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return authFailureResponse(auth);
  }
  const actor = auth.user!;
  if (!MODERATOR_ROLES.includes(actor.role)) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  }

  try {
    await connectDB();

    const page = Math.max(
      1,
      parseInt(req.nextUrl.searchParams.get("page") || "1", 10) || 1,
    );
    const limit = Math.min(
      100,
      Math.max(
        1,
        parseInt(req.nextUrl.searchParams.get("limit") || "20", 10) || 20,
      ),
    );

    const statusParam = req.nextUrl.searchParams.get("status") || "";
    const query: Record<string, unknown> = {};
    // Invalid status values are ignored (treated as "all") rather than erroring,
    // matching how the other filtered admin lists behave.
    if (TICKET_STATUSES.includes(statusParam as SupportTicketStatus)) {
      query.status = statusParam;
    }

    const [total, data] = await Promise.all([
      SupportTicket.countDocuments(query),
      SupportTicket.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    const start = (page - 1) * limit;
    return NextResponse.json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: start + data.length < total,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}
