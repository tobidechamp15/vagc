import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import PrayerRequest from "@/models/PrayerRequest";
import { isDeviceBlocked } from "@/lib/blockedDevices";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rateLimit";

// POST /api/prayer-requests/:id/report  (DEV-29)
//
// Public, no auth — ANY app user can report a prayer wall entry for admin
// review (Play Store UGC policy). This is distinct from DEV-24's admin-only
// hide action: reporting flags content (reportedCount / reportedBy) without
// removing it, so admins can review before moderating.
//
// Request body: { deviceId: string, reason?: string }
// Response:
//   { success, data: { prayerRequest, reportedCount, alreadyReported } }
//   - alreadyReported: true when this device had already reported (no-op);
//     false when this call added the report.
//
// Idempotent per device: the same device can only report a given request once.
// A device cannot report its own submission, and a blocked device cannot
// report (stops report-abuse by banned devices).
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const body = await req.json().catch(() => ({}));
    const deviceId =
      typeof body.deviceId === "string" ? body.deviceId.trim() : "";
    const reason =
      typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";

    if (!deviceId) {
      return NextResponse.json(
        { success: false, error: "deviceId is required" },
        { status: 400 },
      );
    }

    // DEV-30: public write — limit reports per device AND IP.
    const [devRl, ipRl] = await Promise.all([
      checkRateLimit(req, {
        key: "prayer-report.device",
        identifier: deviceId,
        ...RATE_LIMITS.interactionDevice,
      }),
      checkRateLimit(req, {
        key: "prayer-report.ip",
        ...RATE_LIMITS.interactionIp,
      }),
    ]);
    if (!devRl.ok) return rateLimitResponse(devRl.retryAfterSeconds);
    if (!ipRl.ok) return rateLimitResponse(ipRl.retryAfterSeconds);

    await connectDB();

    // DEV-29: a blocked device cannot keep reporting after being moderated.
    if (await isDeviceBlocked(deviceId)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "This device is blocked from interacting with the prayer wall. Contact the church if you believe this is a mistake.",
        },
        { status: 403 },
      );
    }

    const target = await PrayerRequest.findById(params.id);
    if (!target || target.hidden) {
      return NextResponse.json(
        { success: false, error: "Prayer request not found" },
        { status: 404 },
      );
    }
    // A device can't report its own submission (prevents report-farming).
    if (target.deviceId && target.deviceId === deviceId) {
      return NextResponse.json(
        {
          success: false,
          error: "You can't report your own prayer request.",
        },
        { status: 400 },
      );
    }

    // Atomically add the report only if this device hasn't reported already.
    const updated = await PrayerRequest.findOneAndUpdate(
      {
        _id: params.id,
        hidden: false,
        "reportedBy.deviceId": { $ne: deviceId },
      },
      {
        $inc: { reportedCount: 1 },
        $push: { reportedBy: { deviceId, reportedAt: new Date(), reason } },
      },
      { new: true },
    );

    if (!updated) {
      return NextResponse.json({
        success: true,
        data: {
          prayerRequest: target,
          reportedCount: target.reportedCount,
          alreadyReported: true,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        prayerRequest: updated,
        reportedCount: updated.reportedCount,
        alreadyReported: false,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}
