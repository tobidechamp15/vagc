import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Event from "@/models/Event";
import { requireApprovedUser, authFailureResponse } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { logActivity, getRequestMeta } from "@/lib/activity";

// Users allowed to write/restore events. Matches the event write gate.
const WRITER_ROLES = ["admin", "staff"];

// POST /api/events/:id/restore -> restore a soft-deleted event
// (approved admin/staff only). DELETE now only flips `deleted`, so this brings
// the event back exactly as it was and removes it from the deleted set.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return authFailureResponse(auth);
  }
  const actor = auth.user!;
  if (!WRITER_ROLES.includes(actor.role)) {
    logger.warn("event.restore.forbidden", { actor: actor.email });
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  }
  try {
    await connectDB();

    logger.info("event.restore.requested", {
      actor: actor.email,
      eventId: params.id,
    });

    // Clear the deleted flag + who/when it was hidden. Restoring an already
    // live event is a harmless no-op, so this is idempotent.
    const event = await Event.findByIdAndUpdate(
      params.id,
      {
        $set: {
          deleted: false,
          deletedAt: null,
          deletedBy: null,
        },
      },
      { new: true, runValidators: true },
    );
    if (!event) {
      logger.warn("event.restore.not_found", {
        actor: actor.email,
        eventId: params.id,
      });
      return NextResponse.json(
        { success: false, error: "Event not found" },
        { status: 404 },
      );
    }

    // Audit: who restored this event and when.
    await logActivity({
      actor,
      action: "EVENT_RESTORE",
      targetId: event._id.toString(),
      targetName: event.title,
      meta: getRequestMeta(req),
    });

    logger.info("event.restore.succeeded", {
      actor: actor.email,
      eventId: event._id.toString(),
      title: event.title,
    });

    return NextResponse.json({ success: true, data: event });
  } catch (err: any) {
    logger.error("event.restore.failed", {
      actor: actor.email,
      eventId: params.id,
      error: err.message,
      stack: err.stack,
    });
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}
