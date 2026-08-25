import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Event from "@/models/Event";
import { requireApprovedUser, authFailureResponse } from "@/lib/auth";
import { logActivity, diffFields, getRequestMeta } from "@/lib/activity";
import { isPublicHttpUrl, optimizeImageUrl } from "@/lib/cloudinary";
import { logger } from "@/lib/logger";
import { sendPushNotification } from "@/lib/push";
import {
  hasEventDayOrDate,
  EVENT_DESCRIPTION_DAY_DATE_ERROR,
} from "@/lib/eventDates";

// Users allowed to write events. The User model only has admin/staff roles, so
// this matches the existing member-write gate (any approved account).
const WRITER_ROLES = ["admin", "staff"];

// GET /api/events/:id -> public single event (no auth middleware)
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    await connectDB();
    // Soft-deleted events are treated as 404 so they never leak publicly.
    const event = await Event.findOne({
      _id: params.id,
      deleted: { $ne: true },
    });
    if (!event) {
      return NextResponse.json(
        { success: false, error: "Event not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true, data: event });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}

// PUT /api/events/:id -> update an event (approved admin/staff only)
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return authFailureResponse(auth);
  }
  const actor = auth.user!;
  if (!WRITER_ROLES.includes(actor.role)) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  }
  try {
    await connectDB();
    const body = await req.json();

    // imageUrl comes from a direct-to-Cloudinary upload (DEV-18): the client
    // uploads the file straight to Cloudinary and passes back the returned
    // secure_url here. Validate it is a real public http(s) URL so we never
    // persist junk.
    const imageUrl: unknown = (body as Record<string, unknown>).imageUrl;
    if (imageUrl != null && imageUrl !== "" && !isPublicHttpUrl(imageUrl)) {
      return NextResponse.json(
        {
          success: false,
          error: "imageUrl must be a valid http(s) public URL",
        },
        { status: 400 },
      );
    }

    // Event cover images are Cloudinary assets: rewrite to the optimized
    // delivery URL (f_auto,q_auto) so they aren't served full-size/uncompressed.
    if (typeof imageUrl === "string" && imageUrl) {
      (body as Record<string, unknown>).imageUrl = optimizeImageUrl(imageUrl);
    }

    // Events can run across multiple days/weeks/months, so the description
    // must say which day(s)/date(s) the event occurs on. Enforced whenever a
    // new description is supplied on update.
    if (typeof body.description === "string") {
      const desc = body.description.trim();
      if (!hasEventDayOrDate(desc)) {
        return NextResponse.json(
          { success: false, error: EVENT_DESCRIPTION_DAY_DATE_ERROR },
          { status: 400 },
        );
      }
    }

    // Normalize date strings to Date objects before persisting.
    const patch: Record<string, unknown> = { ...body };
    if (typeof body.startsAt === "string")
      patch.startsAt = new Date(body.startsAt);
    if (typeof body.endsAt === "string") patch.endsAt = new Date(body.endsAt);

    // Load the event BEFORE the update so we can audit exactly what changed.
    const before = await Event.findById(params.id);
    if (!before) {
      return NextResponse.json(
        { success: false, error: "Event not found" },
        { status: 404 },
      );
    }

    const event = await Event.findByIdAndUpdate(
      params.id,
      { $set: patch },
      { new: true, runValidators: true },
    );
    if (!event) {
      return NextResponse.json(
        { success: false, error: "Event not found" },
        { status: 404 },
      );
    }

    const changes = diffFields(before.toObject(), event.toObject());

    // Audit: who edited this event and which fields changed.
    await logActivity({
      actor,
      action: "EVENT_UPDATE",
      targetId: event._id.toString(),
      targetName: event.title,
      changes,
      meta: getRequestMeta(req),
    });

    // DEV-96: when an event is edited, let members know — "changes have been
    // made ... check it out". Category "eventInvitations" respects each user's
    // notification pref (default ON). A push failure must never fail the
    // update itself.
    try {
      const titleText =
        typeof event.title === "string" && event.title.trim()
          ? event.title.trim()
          : "this event";
      await sendPushNotification({
        title: "Event Updated",
        body: `Changes have been made to "${titleText}" — check it out!`,
        category: "eventInvitations",
        channelId: "default",
        data: { screen: "EventDetail", eventId: event._id.toString() },
      });
    } catch (pushErr: any) {
      logger.warn("event.update.push_failed", {
        eventId: event._id.toString(),
        error: pushErr.message,
      });
    }

    return NextResponse.json({ success: true, data: event });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}

// DELETE /api/events/:id -> delete an event (approved admin/staff only)
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return authFailureResponse(auth);
  }
  const actor = auth.user!;
  if (!WRITER_ROLES.includes(actor.role)) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  }
  try {
    await connectDB();

    // Soft delete: flip the flag so the document stays in the DB (restorable)
    // but drops out of every public/admin list and detail view immediately.
    const event = await Event.findByIdAndUpdate(
      params.id,
      {
        $set: {
          deleted: true,
          deletedAt: new Date(),
          deletedBy: actor.userId,
        },
      },
      { new: true },
    );
    if (!event) {
      return NextResponse.json(
        { success: false, error: "Event not found" },
        { status: 404 },
      );
    }

    // Audit: who deleted this event.
    await logActivity({
      actor,
      action: "EVENT_DELETE",
      targetId: params.id,
      targetName: event.title,
      meta: getRequestMeta(req),
    });

    return NextResponse.json({ success: true, data: event });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}
