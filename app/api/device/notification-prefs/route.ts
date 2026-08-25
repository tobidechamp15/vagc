import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Device from "@/models/Device";
import { checkRateLimit, rateLimitResponse } from "@/lib/rateLimit";

// ── Anonymous per-device notification preferences ───────────────────────────
// Notification prefs used to live only on User accounts, so logged-out visitors
// had no way to turn categories on/off. These endpoints store prefs on the
// Device doc (keyed by the stable deviceId) and work with NO auth, so every
// install — signed-in or not — can choose what it receives.
//
//   GET /api/device/notification-prefs?deviceId=...   -> the device's prefs
//   PUT /api/device/notification-prefs               -> body { deviceId, ...prefs }
//
// A signed-in app ALSO mirrors the same prefs to /api/auth/me/notification-prefs
// so the account-level master switch stays in sync for that account's devices.

// Same allowed key set as /api/auth/me/notification-prefs (DEV-13).
const ALLOWED_PREF_KEYS = new Set([
  "masterPushEnabled",
  "serviceReminders",
  "eventInvitations",
  "announcements",
  "newsletter",
  "paymentConfirmations",
  "givingReminders",
  "newMemberWelcomes",
  "prayerRequests",
]);

// Server-side defaults (mirror the Device/User model defaults). The GET response
// always returns the FULL shape merged over these, so clients don't guess.
const DEFAULT_PREFS = {
  masterPushEnabled: true,
  serviceReminders: true,
  eventInvitations: true,
  announcements: true,
  newsletter: false,
  paymentConfirmations: true,
  givingReminders: false,
  newMemberWelcomes: true,
  prayerRequests: true,
} as const;

// GET /api/device/notification-prefs?deviceId=...
export async function GET(req: NextRequest) {
  try {
    const deviceId = req.nextUrl.searchParams.get("deviceId") || "";
    if (!deviceId) {
      return NextResponse.json(
        { success: false, error: "deviceId is required" },
        { status: 400 },
      );
    }

    await connectDB();
    // .select(...).lean() widens the return type — cast to the device doc.
    const device = (await Device.findOne({ deviceId })
      .select("notificationPrefs")
      .lean()) as { notificationPrefs?: Record<string, boolean> } | null;

    return NextResponse.json({
      success: true,
      data: {
        notificationPrefs: {
          ...DEFAULT_PREFS,
          ...(device?.notificationPrefs || {}),
        },
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}

// PUT /api/device/notification-prefs
// Body: { deviceId, ...partial prefs } — only the changed keys persist.
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const deviceId = typeof body.deviceId === "string" ? body.deviceId : "";
    if (!deviceId) {
      return NextResponse.json(
        { success: false, error: "deviceId is required" },
        { status: 400 },
      );
    }

    const rl = await checkRateLimit(req, {
      key: "device.prefs",
      limit: 120,
      windowMs: 60 * 1000,
      identifier: deviceId,
    });
    if (!rl.ok) return rateLimitResponse(rl.retryAfterSeconds);

    // Build a dot-notation update for the embedded notificationPrefs sub-doc.
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
    const device = (await Device.findOneAndUpdate(
      { deviceId },
      { $set: setOps },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    )
      .select("notificationPrefs")
      .lean()) as { notificationPrefs?: Record<string, boolean> } | null;

    return NextResponse.json({
      success: true,
      data: {
        notificationPrefs: {
          ...DEFAULT_PREFS,
          ...(device?.notificationPrefs || {}),
        },
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}
