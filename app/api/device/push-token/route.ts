import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Device from "@/models/Device";
import { getAuthUser } from "@/lib/auth";
import { isExpoPushToken } from "@/lib/push";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";

// ── Anonymous device push-token registration ────────────────────────────────
// The old /users/me/push-token route only worked for signed-in staff accounts,
// so logged-out visitors could never receive (or opt out of) push. This route
// is AUTH-OPTIONAL and keyed by the stable deviceId (DEV-20):
//
//   POST   /api/device/push-token   body { token, platform?, deviceId }
//   DELETE /api/device/push-token   body/query { token, deviceId }
//
// When a Bearer token IS present, the device is linked to that account
// (`userId`) so the account's notificationPrefs gate what the device receives
// (account-level is the master for signed-in devices). An anonymous
// registration clears the link, so a signed-out device falls back to its own
// device-level prefs.

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit(req, {
    key: "device.pushToken",
    limit: 60,
    windowMs: 60 * 1000,
  });
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSeconds);

  const authUser = getAuthUser(req); // optional — works for anonymous visitors

  try {
    const body = await req.json().catch(() => ({}));
    const token = typeof body.token === "string" ? body.token.trim() : "";
    const deviceId =
      typeof body.deviceId === "string" ? body.deviceId.trim() : "";

    if (!token || !deviceId) {
      return NextResponse.json(
        { success: false, error: "token and deviceId are required" },
        { status: 400 },
      );
    }
    if (!isExpoPushToken(token)) {
      return NextResponse.json(
        { success: false, error: "token is not a valid Expo push token" },
        { status: 400 },
      );
    }

    const platform =
      typeof body.platform === "string"
        ? body.platform.slice(0, 20)
        : undefined;

    await connectDB();

    const existing = await Device.findOne({ deviceId });
    if (!existing) {
      await Device.create({
        deviceId,
        pushTokens: [
          {
            token,
            platform,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        // A brand-new registration: link to the account only if one is signed in.
        userId: authUser ? authUser.userId : null,
      });
    } else {
      // Upsert this token: drop any stale entry with the same token, then append
      // a fresh one carrying the latest metadata (idempotent re-registration).
      const tokens = (existing.pushTokens || []).filter(
        (t: { token: string }) => t.token !== token,
      );
      tokens.push({
        token,
        platform,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      existing.pushTokens = tokens;
      // Signed-in -> link to the account; signed-out -> clear the link so the
      // device is governed by its own prefs ("even logged-out users have prefs").
      existing.userId = authUser ? authUser.userId : null;
      await existing.save();
    }

    return NextResponse.json({ success: true, data: { deviceId } });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}

// DELETE /api/device/push-token
// Body: { token, deviceId }  (or matching query params)
// Removes this device's token (OS-level permission revoked / app data cleared).
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const deviceId =
      (typeof body.deviceId === "string" ? body.deviceId : "") ||
      req.nextUrl.searchParams.get("deviceId") ||
      "";
    const token =
      (typeof body.token === "string" ? body.token : "") ||
      req.nextUrl.searchParams.get("token") ||
      "";

    if (!deviceId || !token) {
      return NextResponse.json(
        { success: false, error: "deviceId and token are required" },
        { status: 400 },
      );
    }

    await connectDB();
    await Device.updateOne({ deviceId }, { $pull: { pushTokens: { token } } });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}
