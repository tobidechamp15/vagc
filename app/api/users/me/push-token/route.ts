import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import { getAuthUser } from "@/lib/auth";
import { isExpoPushToken } from "@/lib/push";

// ── DEV-26: Expo push token registration ────────────────────────────────────
// The mobile app calls POST on first launch (after a staff account is signed
// in) and DELETE on logout / opt-out. A single account may have several
// devices, each with its own token, so we dedupe per-token and never remove
// another device's registration.

// POST /api/users/me/push-token
// Body: { token, platform?, deviceId? }
//   token    — required, an Expo push token ("ExponentPushToken[...]")
//   platform — "ios" | "android" | "web" (optional)
//   deviceId — stable anonymous device id used across the app (DEV-20)
// Registers (or refreshes) this device's token on the signed-in account.
// Idempotent: re-registering the same token updates its metadata instead of
// creating a duplicate entry.
export async function POST(req: NextRequest) {
  const authUser = getAuthUser(req);
  if (!authUser) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const token = typeof body.token === "string" ? body.token.trim() : "";

    if (!token) {
      return NextResponse.json(
        { success: false, error: "token is required" },
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
    const deviceId =
      typeof body.deviceId === "string"
        ? body.deviceId.slice(0, 200)
        : undefined;

    await connectDB();
    const user = await User.findById(authUser.userId);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 },
      );
    }

    // Upsert this token: drop any stale entry with the same token, then append
    // a fresh one carrying the latest device metadata.
    const tokens = (user.pushTokens || []).filter(
      (t: { token: string }) => t.token !== token,
    );
    tokens.push({
      token,
      platform,
      deviceId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    user.pushTokens = tokens;
    await user.save();

    return NextResponse.json({
      success: true,
      data: { pushTokens: user.pushTokens },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}

// DELETE /api/users/me/push-token
// Body: { token }  (or query param ?token=)
// Removes this device's token from the signed-in account. Used on logout and
// when the OS-level notification permission is revoked.
export async function DELETE(req: NextRequest) {
  const authUser = getAuthUser(req);
  if (!authUser) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const token =
      (typeof body.token === "string" ? body.token.trim() : "") ||
      req.nextUrl.searchParams.get("token") ||
      "";

    if (!token) {
      return NextResponse.json(
        { success: false, error: "token is required" },
        { status: 400 },
      );
    }

    await connectDB();
    const user = await User.findByIdAndUpdate(
      authUser.userId,
      { $pull: { pushTokens: { token } } },
      { new: true },
    ).select("-passwordHash -resetToken -resetTokenExpiry");

    if (!user) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: user });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}
