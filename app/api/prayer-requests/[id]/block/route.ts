import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import PrayerRequest from "@/models/PrayerRequest";
import { requireApprovedUser, authFailureResponse } from "@/lib/auth";
import { logActivity, getRequestMeta } from "@/lib/activity";
import { blockDevice, isDeviceBlocked } from "@/lib/blockedDevices";

// Users allowed to moderate prayer requests (hide/unhide/delete/block).
const MODERATOR_ROLES = ["admin", "staff"];

/** Short excerpt of the message for readable activity-log target names. */
function messageExcerpt(message: string): string {
  return message.length > 60 ? `${message.slice(0, 60)}…` : message;
}

// POST /api/prayer-requests/:id/block  (DEV-29)
//
// Admin/staff moderation. Blocks the DEVICE that submitted this prayer request
// (device-level blocking — the public wall has no user account to block) AND
// hides the request so the offending content comes off the wall. Blocking is
// idempotent: blocking an already-blocked device is a no-op (but still hides).
//
// Request body: { reason?: string }
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
    const body = await req.json().catch(() => ({}));
    const reason =
      typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";

    const prayerRequest = await PrayerRequest.findById(params.id);
    if (!prayerRequest) {
      return NextResponse.json(
        { success: false, error: "Prayer request not found" },
        { status: 404 },
      );
    }

    if (!prayerRequest.deviceId) {
      return NextResponse.json(
        {
          success: false,
          error:
            "This request has no device id to block (it was submitted before device tracking). Delete it instead.",
        },
        { status: 400 },
      );
    }

    const alreadyBlocked = await isDeviceBlocked(prayerRequest.deviceId);
    await blockDevice({
      deviceId: prayerRequest.deviceId,
      reason:
        reason || "Blocked from the prayer wall for inappropriate content",
      blockedBy: actor.email,
    });

    // Blocking is a moderation action — take the offending content down too.
    const updated = await PrayerRequest.findByIdAndUpdate(
      params.id,
      { $set: { hidden: true } },
      { new: true },
    );

    // Audit: who blocked which device (and hid the request).
    await logActivity({
      actor,
      action: "PRAYER_BLOCK_DEVICE",
      targetId: prayerRequest._id.toString(),
      targetName: messageExcerpt(prayerRequest.message),
      meta: {
        ...getRequestMeta(req),
        deviceId: prayerRequest.deviceId,
        reason: reason || undefined,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        prayerRequest: updated ?? prayerRequest,
        blockedDeviceId: prayerRequest.deviceId,
        alreadyBlocked,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}
