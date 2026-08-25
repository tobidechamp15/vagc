import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Event from "@/models/Event";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rateLimit";

// POST /api/events/:id/rsvp
//
// Public, no auth. A member taps "I'm going" and the client sends a stable
// device identifier so the same person tapping twice doesn't double the
// headcount. The write is atomic (findOneAndUpdate with a deviceId exclusion
// filter), so two concurrent taps from the same device still only add one
// RSVP.
//
// Request body: { deviceId: string }
// Response:
//   { success, data: { event, rsvpCount, alreadyRsvped } }
//   - alreadyRsvped: true when the device had already RSVPed (no-op, count
//     unchanged); false when this call added the RSVP.
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

    // DEV-30: public write — limit RSVPs per device AND per IP.
    const [devRl, ipRl] = await Promise.all([
      checkRateLimit(req, {
        key: "rsvp.device",
        identifier: deviceId,
        ...RATE_LIMITS.interactionDevice,
      }),
      checkRateLimit(req, {
        key: "rsvp.ip",
        ...RATE_LIMITS.interactionIp,
      }),
    ]);
    if (!devRl.ok) return rateLimitResponse(devRl.retryAfterSeconds);
    if (!ipRl.ok) return rateLimitResponse(ipRl.retryAfterSeconds);

    await connectDB();

    // Atomically add the RSVP only if this device hasn't RSVPed already.
    // $ne on the array element means: no match -> nothing pushed, so the
    // returned doc is null. That can mean "event missing", "event deleted", or
    // "already RSVPed", so we disambiguate below. Soft-deleted events are not
    // RSVPable.
    const updated = await Event.findOneAndUpdate(
      {
        _id: params.id,
        deleted: { $ne: true },
        "rsvps.deviceId": { $ne: deviceId },
      },
      { $push: { rsvps: { deviceId, respondedAt: new Date() } } },
      { new: true },
    );

    if (!updated) {
      // Either the event doesn't exist, is deleted, or this device already
      // RSVPed.
      const existing = await Event.findOne({
        _id: params.id,
        deleted: { $ne: true },
      });
      if (!existing) {
        return NextResponse.json(
          { success: false, error: "Event not found" },
          { status: 404 },
        );
      }
      return NextResponse.json({
        success: true,
        data: {
          event: existing,
          rsvpCount: existing.rsvps.length,
          alreadyRsvped: true,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        event: updated,
        rsvpCount: updated.rsvps.length,
        alreadyRsvped: false,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}

// DELETE /api/events/:id/rsvp
//
// Public, no auth. Reverses a prior RSVP: removes this device's entry from the
// event's rsvps array, so the headcount drops and the "Going" state clears.
// The write is atomic (findOneAndUpdate with a deviceId match + $pull) and
// idempotent — a second delete for a device that already un-RSVPed is a no-op
// (wasRsvped: false, count unchanged).
//
// Request body: { deviceId: string } — also accepted as a ?deviceId= query
// param, since some clients/proxies strip DELETE bodies.
// Response:
//   { success, data: { event, rsvpCount, wasRsvped } }
//   - wasRsvped: true when this call removed the device's RSVP; false when the
//     device wasn't on the list (no-op).
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const body = await req.json().catch(() => ({}));
    const deviceId =
      (typeof body.deviceId === "string" ? body.deviceId.trim() : "") ||
      (req.nextUrl.searchParams.get("deviceId") || "").trim();

    if (!deviceId) {
      return NextResponse.json(
        { success: false, error: "deviceId is required" },
        { status: 400 },
      );
    }

    // DEV-30: public write — rate limit un-RSVPs per device AND per IP, same
    // as the RSVP POST so toggling can't be spammed.
    const [devRl, ipRl] = await Promise.all([
      checkRateLimit(req, {
        key: "rsvp.device",
        identifier: deviceId,
        ...RATE_LIMITS.interactionDevice,
      }),
      checkRateLimit(req, {
        key: "rsvp.ip",
        ...RATE_LIMITS.interactionIp,
      }),
    ]);
    if (!devRl.ok) return rateLimitResponse(devRl.retryAfterSeconds);
    if (!ipRl.ok) return rateLimitResponse(ipRl.retryAfterSeconds);

    await connectDB();

    // Atomically remove this device's RSVP only if it's actually on the list.
    const updated = await Event.findOneAndUpdate(
      {
        _id: params.id,
        deleted: { $ne: true },
        "rsvps.deviceId": deviceId,
      },
      { $pull: { rsvps: { deviceId } } },
      { new: true },
    );

    if (!updated) {
      // Either the event doesn't exist, is deleted, or this device wasn't on
      // the list. Disambiguate so "never RSVPed" is not a 404.
      const existing = await Event.findOne({
        _id: params.id,
        deleted: { $ne: true },
      });
      if (!existing) {
        return NextResponse.json(
          { success: false, error: "Event not found" },
          { status: 404 },
        );
      }
      return NextResponse.json({
        success: true,
        data: {
          event: existing,
          rsvpCount: existing.rsvps.length,
          wasRsvped: false,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        event: updated,
        rsvpCount: updated.rsvps.length,
        wasRsvped: true,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}
