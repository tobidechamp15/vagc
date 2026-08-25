import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import PrayerRequest from "@/models/PrayerRequest";
import { isDeviceBlocked } from "@/lib/blockedDevices";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rateLimit";

// POST /api/prayer-requests/:id/pray
//
// Public, no auth. A member taps "praying for this" and the client sends the
// same persisted device identifier used for event RSVPs (DEV-20), so one
// person tapping twice doesn't double the count. The write is atomic
// (findOneAndUpdate with a deviceId exclusion filter + $inc), so two
// concurrent taps from the same device still only add one prayer.
//
// Request body: { deviceId: string }
// Response:
//   { success, data: { prayerRequest, prayedForCount, alreadyPrayed } }
//   - alreadyPrayed: true when this device had already prayed (no-op, count
//     unchanged); false when this call added the prayer.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const body = await req.json().catch(() => ({}));
    const deviceId =
      typeof body.deviceId === "string" ? body.deviceId.trim() : "";

    if (!deviceId) {
      return NextResponse.json(
        { success: false, error: "deviceId is required" },
        { status: 400 },
      );
    }

    // DEV-30: public write — limit "praying for this" taps per device AND IP.
    const [devRl, ipRl] = await Promise.all([
      checkRateLimit(req, {
        key: "pray.device",
        identifier: deviceId,
        ...RATE_LIMITS.interactionDevice,
      }),
      checkRateLimit(req, {
        key: "pray.ip",
        ...RATE_LIMITS.interactionIp,
      }),
    ]);
    if (!devRl.ok) return rateLimitResponse(devRl.retryAfterSeconds);
    if (!ipRl.ok) return rateLimitResponse(ipRl.retryAfterSeconds);

    await connectDB();

    // DEV-29: a blocked device cannot keep interacting with the wall.
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

    // Atomically add the prayer + bump the count only if this device hasn't
    // prayed already (and the request isn't hidden/modderated).
    const updated = await PrayerRequest.findOneAndUpdate(
      {
        _id: params.id,
        hidden: false,
        "prayedBy.deviceId": { $ne: deviceId },
      },
      {
        $push: { prayedBy: { deviceId, prayedAt: new Date() } },
        $inc: { prayedForCount: 1 },
      },
      { new: true },
    );

    if (!updated) {
      // Either the request doesn't exist, is hidden, or this device already
      // prayed — disambiguate below.
      const existing = await PrayerRequest.findById(params.id);
      if (!existing || existing.hidden) {
        return NextResponse.json(
          { success: false, error: "Prayer request not found" },
          { status: 404 },
        );
      }
      return NextResponse.json({
        success: true,
        data: {
          prayerRequest: existing,
          prayedForCount: existing.prayedForCount,
          alreadyPrayed: true,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        prayerRequest: updated,
        prayedForCount: updated.prayedForCount,
        alreadyPrayed: false,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}

// DELETE /api/prayer-requests/:id/pray
//
// Public, no auth — the reversible half of the "praying for this" tap. Removes
// this device's prayer from the request and decrements the count. Idempotent:
// if this device hadn't prayed, it's a no-op (count unchanged). Uses the same
// persisted deviceId as POST, with the same per-device + per-IP rate limits.
//
// Request body: { deviceId: string }
// Response:
//   { success, data: { prayerRequest, prayedForCount, alreadyPrayed } }
//   - alreadyPrayed: true when this call removed the prayer; false when this
//     device hadn't prayed (no-op, count unchanged).
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const body = await req.json().catch(() => ({}));
    const deviceId =
      typeof body.deviceId === "string" ? body.deviceId.trim() : "";

    if (!deviceId) {
      return NextResponse.json(
        { success: false, error: "deviceId is required" },
        { status: 400 },
      );
    }

    // DEV-30: public write — limit un-pray taps per device AND IP (same caps
    // as the pray tap itself).
    const [devRl, ipRl] = await Promise.all([
      checkRateLimit(req, {
        key: "pray.device",
        identifier: deviceId,
        ...RATE_LIMITS.interactionDevice,
      }),
      checkRateLimit(req, {
        key: "pray.ip",
        ...RATE_LIMITS.interactionIp,
      }),
    ]);
    if (!devRl.ok) return rateLimitResponse(devRl.retryAfterSeconds);
    if (!ipRl.ok) return rateLimitResponse(ipRl.retryAfterSeconds);

    await connectDB();

    // Atomically remove the prayer + decrement the count only if this device
    // had prayed (and the request isn't hidden). The match filter guarantees
    // the count can't be driven below 0 by a stale DELETE.
    const updated = await PrayerRequest.findOneAndUpdate(
      {
        _id: params.id,
        hidden: false,
        "prayedBy.deviceId": deviceId,
      },
      {
        $pull: { prayedBy: { deviceId } },
        $inc: { prayedForCount: -1 },
      },
      { new: true },
    );

    if (!updated) {
      // Either the request doesn't exist, is hidden, or this device hadn't
      // prayed — disambiguate below.
      const existing = await PrayerRequest.findById(params.id);
      if (!existing || existing.hidden) {
        return NextResponse.json(
          { success: false, error: "Prayer request not found" },
          { status: 404 },
        );
      }
      return NextResponse.json({
        success: true,
        data: {
          prayerRequest: existing,
          prayedForCount: existing.prayedForCount,
          alreadyPrayed: false,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        prayerRequest: updated,
        prayedForCount: updated.prayedForCount,
        alreadyPrayed: true,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}
