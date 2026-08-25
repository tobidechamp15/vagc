import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Post from "@/models/Post";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rateLimit";

// POST /api/posts/:id/react
//
// Public, no auth. A member taps "Amen" and the client sends the same
// persisted device identifier used for event RSVPs (DEV-18) and prayer-request
// taps (DEV-21), so one person tapping twice doesn't double the count. This is
// the same device-idempotent pattern as those endpoints — one reusable shape,
// not a third variant. The write is atomic (findOneAndUpdate with a deviceId
// exclusion filter + $inc), so two concurrent taps from the same device still
// only add one reaction.
//
// Request body: { deviceId: string }
// Response:
//   { success, data: { post, reactionCount, alreadyReacted } }
//   - alreadyReacted: true when this device had already reacted (no-op, count
//     unchanged); false when this call added the reaction.
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

    // DEV-30: public write — limit reaction taps per device AND per IP so a
    // single device (or a shared wifi IP) can't hammer the counter across many
    // posts. The idempotent device guard below still prevents double counting.
    const [devRl, ipRl] = await Promise.all([
      checkRateLimit(req, {
        key: "react.device",
        identifier: deviceId,
        ...RATE_LIMITS.interactionDevice,
      }),
      checkRateLimit(req, {
        key: "react.ip",
        ...RATE_LIMITS.interactionIp,
      }),
    ]);
    if (!devRl.ok) return rateLimitResponse(devRl.retryAfterSeconds);
    if (!ipRl.ok) return rateLimitResponse(ipRl.retryAfterSeconds);

    await connectDB();

    // Atomically add the reaction + bump the count only if this device hasn't
    // reacted already. Soft-deleted posts are not reactable.
    const updated = await Post.findOneAndUpdate(
      {
        _id: params.id,
        deleted: { $ne: true },
        "reactedBy.deviceId": { $ne: deviceId },
      },
      {
        $push: { reactedBy: { deviceId, reactedAt: new Date() } },
        $inc: { reactionCount: 1 },
      },
      { new: true },
    );

    if (!updated) {
      // Either the post doesn't exist, is deleted, or this device already
      // reacted — disambiguate below.
      const existing = await Post.findOne({
        _id: params.id,
        deleted: { $ne: true },
      });
      if (!existing) {
        return NextResponse.json(
          { success: false, error: "Post not found" },
          { status: 404 },
        );
      }
      return NextResponse.json({
        success: true,
        data: {
          post: existing,
          reactionCount: existing.reactionCount,
          alreadyReacted: true,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        post: updated,
        reactionCount: updated.reactionCount,
        alreadyReacted: false,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}

// DELETE /api/posts/:id/react
//
// Public, no auth — the reversible half of the "Amen" tap. Removes this
// device's reaction and decrements the count. Idempotent: if this device
// hadn't reacted, it's a no-op (count unchanged). Uses the same persisted
// deviceId as POST, with the same per-device + per-IP rate limits.
//
// Request body: { deviceId: string }
// Response:
//   { success, data: { post, reactionCount, alreadyReacted } }
//   - alreadyReacted: true when this call removed the reaction; false when this
//     device hadn't reacted (no-op, count unchanged).
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

    // DEV-30: public write — limit un-react taps per device AND IP (same caps
    // as the react tap itself).
    const [devRl, ipRl] = await Promise.all([
      checkRateLimit(req, {
        key: "react.device",
        identifier: deviceId,
        ...RATE_LIMITS.interactionDevice,
      }),
      checkRateLimit(req, {
        key: "react.ip",
        ...RATE_LIMITS.interactionIp,
      }),
    ]);
    if (!devRl.ok) return rateLimitResponse(devRl.retryAfterSeconds);
    if (!ipRl.ok) return rateLimitResponse(ipRl.retryAfterSeconds);

    await connectDB();

    // Atomically remove the reaction + decrement the count only if this device
    // had reacted (and the post isn't soft-deleted). The match filter
    // guarantees the count can't be driven below 0 by a stale DELETE.
    const updated = await Post.findOneAndUpdate(
      {
        _id: params.id,
        deleted: { $ne: true },
        "reactedBy.deviceId": deviceId,
      },
      {
        $pull: { reactedBy: { deviceId } },
        $inc: { reactionCount: -1 },
      },
      { new: true },
    );

    if (!updated) {
      // Either the post doesn't exist, is deleted, or this device hadn't
      // reacted — disambiguate below.
      const existing = await Post.findOne({
        _id: params.id,
        deleted: { $ne: true },
      });
      if (!existing) {
        return NextResponse.json(
          { success: false, error: "Post not found" },
          { status: 404 },
        );
      }
      return NextResponse.json({
        success: true,
        data: {
          post: existing,
          reactionCount: existing.reactionCount,
          alreadyReacted: false,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        post: updated,
        reactionCount: updated.reactionCount,
        alreadyReacted: true,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}
