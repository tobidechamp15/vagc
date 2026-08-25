import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import PrayerRequest from "@/models/PrayerRequest";
import { requireApprovedUser, authFailureResponse } from "@/lib/auth";
import { logActivity, getRequestMeta } from "@/lib/activity";
import { unblockDevice } from "@/lib/blockedDevices";

// Users allowed to moderate prayer requests.
const MODERATOR_ROLES = ["admin", "staff"];

/** Short excerpt of the message for readable activity-log target names. */
function messageExcerpt(message: string): string {
  return message.length > 60 ? `${message.slice(0, 60)}…` : message;
}

// POST /api/prayer-requests/:id/unblock  (DEV-29)
//
// Admin/staff moderation. Removes the device-level block on the device that
// submitted this prayer request. The request itself is NOT re-shown (a hidden
// request stays hidden — un-hide separately via PUT if appropriate).
//
// Returns { success, data: { unblocked: boolean } }.
export async function POST(
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
    const prayerRequest = await PrayerRequest.findById(params.id);
    if (!prayerRequest) {
      return NextResponse.json(
        { success: false, error: "Prayer request not found" },
        { status: 404 },
      );
    }
    if (!prayerRequest.deviceId) {
      return NextResponse.json(
        { success: false, error: "This request has no device id to unblock" },
        { status: 400 },
      );
    }

    const removed = await unblockDevice(prayerRequest.deviceId);

    // Audit: who unblocked which device.
    await logActivity({
      actor,
      action: "PRAYER_UNBLOCK_DEVICE",
      targetId: prayerRequest._id.toString(),
      targetName: messageExcerpt(prayerRequest.message),
      meta: {
        ...getRequestMeta(req),
        deviceId: prayerRequest.deviceId,
      },
    });

    return NextResponse.json({
      success: true,
      data: { unblocked: removed },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}
