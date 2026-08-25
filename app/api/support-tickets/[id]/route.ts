import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import SupportTicket, { SupportTicketStatus } from "@/models/SupportTicket";
import { requireApprovedUser, authFailureResponse } from "@/lib/auth";
import { logActivity, diffFields, getRequestMeta } from "@/lib/activity";

// Users allowed to triage/respond to support tickets. Matches the other
// management gates (posts, events, prayer-requests) — admin/staff only.
const MODERATOR_ROLES = ["admin", "staff"];

const TICKET_STATUSES: SupportTicketStatus[] = [
  "open",
  "in_progress",
  "resolved",
];

// PUT /api/support-tickets/:id -> admin triage/respond (approved admin/staff).
//
// Body (either or both):
//   { status: "open" | "in_progress" | "resolved" }
//   { adminResponse: string | null }
//
// Reversibility: every status is a valid target — open ↔ in_progress ↔
// resolved are all mutually reachable, so no status is a one-way door (an
// admin can always move a ticket back). `resolvedAt` is kept consistent:
// set when a ticket moves TO resolved and cleared when it moves away.
// Every update is audited as SUPPORT_TICKET_UPDATE.
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
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
    const body = await req.json().catch(() => ({}));

    const set: Record<string, unknown> = {};

    if (body.status !== undefined) {
      if (!TICKET_STATUSES.includes(body.status as SupportTicketStatus)) {
        return NextResponse.json(
          {
            success: false,
            error: "status must be one of open, in_progress, resolved",
          },
          { status: 400 },
        );
      }
      set.status = body.status;
      // Keep resolvedAt consistent: set on resolve, cleared on reopen.
      set.resolvedAt = body.status === "resolved" ? new Date() : null;
    }

    if (body.adminResponse !== undefined) {
      if (body.adminResponse === null) {
        set.adminResponse = null;
      } else if (typeof body.adminResponse === "string") {
        const trimmed = body.adminResponse.trim();
        if (trimmed.length > 2000) {
          return NextResponse.json(
            {
              success: false,
              error: "adminResponse must be 2000 characters or fewer",
            },
            { status: 400 },
          );
        }
        set.adminResponse = trimmed || null;
      } else {
        return NextResponse.json(
          { success: false, error: "adminResponse must be a string or null" },
          { status: 400 },
        );
      }
    }

    if (Object.keys(set).length === 0) {
      return NextResponse.json(
        { success: false, error: "nothing to update" },
        { status: 400 },
      );
    }

    // Load BEFORE the update so we can audit exactly what changed.
    const before = await SupportTicket.findById(params.id);
    if (!before) {
      return NextResponse.json(
        { success: false, error: "Support ticket not found" },
        { status: 404 },
      );
    }

    const ticket = await SupportTicket.findByIdAndUpdate(
      params.id,
      { $set: set },
      { new: true, runValidators: true },
    );
    if (!ticket) {
      return NextResponse.json(
        { success: false, error: "Support ticket not found" },
        { status: 404 },
      );
    }

    const changes = diffFields(before.toObject(), ticket.toObject());

    // Audit: which admin changed what on this ticket.
    await logActivity({
      actor,
      action: "SUPPORT_TICKET_UPDATE",
      targetId: ticket._id.toString(),
      targetName: ticket.subject,
      changes,
      meta: getRequestMeta(req),
    });

    return NextResponse.json({ success: true, data: ticket });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}
