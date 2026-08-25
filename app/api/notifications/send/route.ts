import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser, authFailureResponse } from "@/lib/auth";
import { sendPushNotification, PUSH_CATEGORY_PREF_KEYS } from "@/lib/push";

// ── DEV-26: push notification sender (route + cron job) ─────────────────────
// This single route doubles as:
//   POST  — on-demand broadcast. Approved admin/staff push a message to all
//           eligible users (or an explicit userIds allow-list).
//   GET   — scheduled sender job, called by Vercel Cron (protected by
//           CRON_SECRET, same as /api/cron/birthday-check). Sends a weekly
//           reminder whose title/body are configurable via env vars, so the
//           church can tune the message without a code deploy.

// POST /api/notifications/send
// Body: { title, body, category?, userIds?, data? }
//   title    — required, notification title
//   body     — required, notification body text
//   category — optional; maps to a notificationPrefs toggle (see PUSH_CATEGORY_PREF_KEYS).
//              When omitted the message goes to everyone with push enabled.
//   userIds  — optional allow-list of user ids; delivered only to those accounts
//              (still respecting each user's masterPushEnabled pref).
//   data     — optional JSON payload attached to the notification (e.g. screen
//              deep-link params).
export async function POST(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) return authFailureResponse(auth);

  try {
    const body = await req.json().catch(() => ({}));
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const bodyText = typeof body.body === "string" ? body.body.trim() : "";

    if (!title || !bodyText) {
      return NextResponse.json(
        { success: false, error: "title and body are required" },
        { status: 400 },
      );
    }

    const category =
      typeof body.category === "string" &&
      PUSH_CATEGORY_PREF_KEYS[body.category]
        ? body.category
        : undefined;
    const userIds = Array.isArray(body.userIds)
      ? body.userIds.filter((id: unknown) => typeof id === "string")
      : undefined;
    const data =
      body.data && typeof body.data === "object" ? body.data : undefined;

    const result = await sendPushNotification({
      title,
      body: bodyText,
      category,
      userIds,
      data,
      channelId: "default",
    });

    return NextResponse.json({
      success: true,
      data: {
        sent: result.sent,
        failed: result.failed,
        invalidTokensRemoved: result.invalidTokens.length,
        errors: result.errors.slice(0, 10),
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}

// GET /api/notifications/send  — scheduled cron job (Vercel Cron, see vercel.json)
// Protect with CRON_SECRET so it can't be triggered by anyone else.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const title = process.env.PUSH_CRON_TITLE || "Church Reminder";
    const body =
      process.env.PUSH_CRON_BODY ||
      "A gentle reminder about this week's services and events at church.";

    const result = await sendPushNotification({
      title,
      body,
      category: "serviceReminders",
      channelId: "default",
    });

    return NextResponse.json({
      success: true,
      sent: result.sent,
      failed: result.failed,
      invalidTokensRemoved: result.invalidTokens.length,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}
