import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Event from "@/models/Event";
import { requireApprovedUser, authFailureResponse } from "@/lib/auth";
import { logActivity, getRequestMeta } from "@/lib/activity";
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

// GET /api/events                     -> public upcoming events (paginated, soonest first)
// GET /api/events?page=2&limit=10     -> paginate (page is 1-based, default limit 10)
// GET /api/events?deleted=1           -> admin/staff-only list of soft-deleted
//                                         events (DEV-95), newest first — feeds
//                                         the mobile "Deleted events" view.
// No auth middleware for the public listing; ?deleted=1 is gated to writers.
export async function GET(req: NextRequest) {
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
        parseInt(req.nextUrl.searchParams.get("limit") || "10", 10) || 10,
      ),
    );

    // Admin/staff-only "deleted" view — the mobile app's restore screen.
    // Mirrors the dashboard's Deleted tab: ALL soft-deleted events (past and
    // future) sorted newest first, so a mistakenly deleted event is never
    // silently unreachable.
    const showDeleted = req.nextUrl.searchParams.get("deleted") === "1";
    if (showDeleted) {
      const auth = await requireApprovedUser(req);
      if (!auth.ok) {
        return authFailureResponse(auth);
      }
      if (!WRITER_ROLES.includes(auth.user!.role)) {
        return NextResponse.json(
          { success: false, error: "Forbidden" },
          { status: 403 },
        );
      }
    }

    // Public list shows events whose [start, end] window covers the current
    // time — "startsAt <= now <= endsAt" (timestamp-exact, not just date).
    // A null endsAt is treated as open-ended (still ongoing, no end set yet).
    // Soft-deleted events are always hidden from the public list.
    const now = new Date();
    const query = showDeleted
      ? { deleted: true }
      : {
          deleted: { $ne: true },
          startsAt: { $lte: now },
          $or: [{ endsAt: { $gte: now } }, { endsAt: null }],
        };
    // `1 | -1` (not `number`) so TS accepts it as a mongoose SortOrder.
    const sort: Record<string, 1 | -1> = showDeleted
      ? { startsAt: -1 }
      : { startsAt: 1 };
    const [total, data] = await Promise.all([
      Event.countDocuments(query),
      Event.find(query)
        .sort(sort)
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

// POST /api/events -> create an event (approved admin/staff only)
export async function POST(req: NextRequest) {
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

    const { title, description, location, startsAt, endsAt, imageUrl } = body;
    if (!title || !startsAt) {
      return NextResponse.json(
        { success: false, error: "title and startsAt are required" },
        { status: 400 },
      );
    }

    // Events can run across multiple days/weeks/months (e.g. a revival on
    // Mondays, Wednesdays & Fridays for two months), so the description must
    // explicitly say which day(s)/date(s) the event occurs on. Enforced on
    // create so every public event tells members when to attend.
    const desc = typeof description === "string" ? description.trim() : "";
    if (!hasEventDayOrDate(desc)) {
      return NextResponse.json(
        { success: false, error: EVENT_DESCRIPTION_DAY_DATE_ERROR },
        { status: 400 },
      );
    }

    // imageUrl comes from a direct-to-Cloudinary upload (DEV-18): the client
    // uploads the file straight to Cloudinary and passes back the returned
    // secure_url here. Validate it is a real public http(s) URL so we never
    // persist junk.
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
    const resolvedImageUrl =
      typeof imageUrl === "string" && imageUrl
        ? optimizeImageUrl(imageUrl)
        : imageUrl;

    const event = await Event.create({
      title,
      description,
      location,
      startsAt: new Date(startsAt),
      endsAt: endsAt ? new Date(endsAt) : null,
      imageUrl: resolvedImageUrl,
      createdBy: actor.userId,
    });

    // Audit: who created this event.
    await logActivity({
      actor,
      action: "EVENT_CREATE",
      targetId: event._id.toString(),
      targetName: event.title,
      meta: getRequestMeta(req),
    });

    // DEV-96: fan a push notification out to every registered device when a new
    // event is published. Category "eventInvitations" respects each user's
    // notification pref (default ON), so members who opted out aren't hit. A
    // push failure must never fail the event create itself.
    try {
      const pushBody =
        (typeof event.title === "string" && event.title.trim()) ||
        (typeof event.description === "string"
          ? event.description.trim().slice(0, 160)
          : "");
      await sendPushNotification({
        title: "New Event",
        body: pushBody,
        category: "eventInvitations",
        channelId: "default",
        data: { screen: "EventDetail", eventId: event._id.toString() },
      });
    } catch (pushErr: any) {
      logger.warn("event.create.push_failed", {
        eventId: event._id.toString(),
        error: pushErr.message,
      });
    }

    return NextResponse.json({ success: true, data: event }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}
