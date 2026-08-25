import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import PrayerRequest from "@/models/PrayerRequest";
import { requireApprovedUser, authFailureResponse } from "@/lib/auth";
import { logActivity, getRequestMeta } from "@/lib/activity";

// Users allowed to moderate prayer requests (hide/unhide/delete). Matches the
// member/post/event write gate — any approved admin/staff account.
const MODERATOR_ROLES = ["admin", "staff"];

/** Short excerpt of the message for readable activity-log target names. */
function messageExcerpt(message: string): string {
  return message.length > 60 ? `${message.slice(0, 60)}…` : message;
}

// GET /api/prayer-requests/:id -> public single request.
// Hidden (moderated) requests are treated as 404 so they never leak publicly.
// DEV-29: moderation fields (deviceId / reports) are admin-only and projected
// out of this public response.
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    await connectDB();
    const prayerRequest = await PrayerRequest.findOne({
      _id: params.id,
      hidden: false,
    }).select("-deviceId -reportedCount -reportedBy");
    if (!prayerRequest) {
      return NextResponse.json(
        { success: false, error: "Prayer request not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true, data: prayerRequest });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}

// PUT /api/prayer-requests/:id -> admin moderation.
// Body:
//   { hidden: boolean }   — true to hide (removes it from the public wall),
//                           false to un-hide.
//   { clearReports: true }— DEV-29: reset the reported flag after review so a
//                           reviewed request drops out of the admin queue.
// Either (or both) may be sent; both are audited so there's a record.
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

    const hidden = body.hidden;
    const clearReports = body.clearReports;
    if (hidden !== undefined && typeof hidden !== "boolean") {
      return NextResponse.json(
        { success: false, error: "hidden must be a boolean" },
        { status: 400 },
      );
    }
    if (clearReports !== undefined && clearReports !== true) {
      return NextResponse.json(
        { success: false, error: "clearReports must be true" },
        { status: 400 },
      );
    }
    if (hidden === undefined && clearReports !== true) {
      return NextResponse.json(
        { success: false, error: "nothing to update" },
        { status: 400 },
      );
    }

    const before = await PrayerRequest.findById(params.id);
    if (!before) {
      return NextResponse.json(
        { success: false, error: "Prayer request not found" },
        { status: 404 },
      );
    }

    const set: Record<string, unknown> = {};
    if (hidden !== undefined) set.hidden = hidden;
    if (clearReports === true) {
      set.reportedCount = 0;
      set.reportedBy = [];
    }

    const prayerRequest = await PrayerRequest.findByIdAndUpdate(
      params.id,
      { $set: set },
      { new: true, runValidators: true },
    );
    if (!prayerRequest) {
      return NextResponse.json(
        { success: false, error: "Prayer request not found" },
        { status: 404 },
      );
    }

    // Audit: who hid/unhid this request and when.
    if (hidden !== undefined) {
      await logActivity({
        actor,
        action: hidden ? "PRAYER_HIDE" : "PRAYER_UNHIDE",
        targetId: prayerRequest._id.toString(),
        targetName: messageExcerpt(prayerRequest.message),
        meta: getRequestMeta(req),
      });
    }
    if (clearReports === true) {
      await logActivity({
        actor,
        action: "PRAYER_CLEAR_REPORTS",
        targetId: prayerRequest._id.toString(),
        targetName: messageExcerpt(prayerRequest.message),
        meta: getRequestMeta(req),
      });
    }

    return NextResponse.json({ success: true, data: prayerRequest });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}

// DELETE /api/prayer-requests/:id -> admin hard delete (logged).
export async function DELETE(
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
    const prayerRequest = await PrayerRequest.findByIdAndDelete(params.id);
    if (!prayerRequest) {
      return NextResponse.json(
        { success: false, error: "Prayer request not found" },
        { status: 404 },
      );
    }

    // Audit: who hard-deleted this request.
    await logActivity({
      actor,
      action: "PRAYER_DELETE",
      targetId: params.id,
      targetName: messageExcerpt(prayerRequest.message),
      meta: getRequestMeta(req),
    });

    return NextResponse.json({ success: true, data: prayerRequest });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}
