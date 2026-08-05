import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import { getAuthUser } from "@/lib/auth";

// ALLOWED notification preference keys
const ALLOWED_PREF_KEYS = new Set([
  "masterPushEnabled",
  "emailEnabled",
  "smsEnabled",
  "serviceReminders",
  "eventInvitations",
  "announcements",
  "newsletter",
  "paymentConfirmations",
  "givingReminders",
  "newMemberWelcomes",
  "prayerRequests",
]);

// PUT /api/auth/me/notification-prefs — update notification preferences
// Accepts a partial payload — only the changed keys. Each change persists
// immediately (single-flip model), no batch save.
export async function PUT(req: NextRequest) {
  const authUser = getAuthUser(req);
  if (!authUser) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const body = await req.json();

    // Build a dot-notation update for the embedded notificationPrefs sub-doc
    const setOps: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(body)) {
      if (ALLOWED_PREF_KEYS.has(key) && typeof value === "boolean") {
        setOps[`notificationPrefs.${key}`] = value;
      }
    }

    if (Object.keys(setOps).length === 0) {
      return NextResponse.json(
        { success: false, error: "No valid preference keys in payload" },
        { status: 400 },
      );
    }

    await connectDB();
    const user = await User.findByIdAndUpdate(
      authUser.userId,
      { $set: setOps },
      { new: true, runValidators: true },
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
