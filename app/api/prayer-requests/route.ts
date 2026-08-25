import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import PrayerRequest from "@/models/PrayerRequest";
import BlockedDevice from "@/models/BlockedDevice";
import { isDeviceBlocked } from "@/lib/blockedDevices";
import { requireApprovedUser, authFailureResponse } from "@/lib/auth";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rateLimit";

// Users allowed to view/moderate prayer requests. Matches the dashboard gate.
const MODERATOR_ROLES = ["admin", "staff"];

// GET /api/prayer-requests                        -> public wall (paginated)
// GET /api/prayer-requests?page=2&limit=10        -> paginate (page 1-based)
// GET /api/prayer-requests?moderation=1&status=... -> admin/staff-only
//     moderation view (DEV-98 mobile mirror). Keeps hidden requests reachable
//     (for un-hide), exposes the moderation fields (deviceId / reportedCount /
//     reportedBy), and annotates each item with `blocked` (is the submitting
//     device blocked?). `status` mirrors the dashboard tabs: reported | hidden
//     | live | (empty = all).
// No auth middleware for the public listing; ?moderation=1 is gated to writers.
export async function GET(req: NextRequest) {
  try {
    await connectDB();

    const page = Math.max(
      1,
      parseInt(req.nextUrl.searchParams.get("page") || "1", 10) || 1,
    );
    const limit = Math.min(
      100,
      Math.max(
        1,
        parseInt(req.nextUrl.searchParams.get("limit") || "20", 10) || 20,
      ),
    );

    const moderation = req.nextUrl.searchParams.get("moderation") === "1";
    const status = req.nextUrl.searchParams.get("status") || "";

    const query: Record<string, unknown> = { hidden: false };
    // DEV-29: moderation fields (submitter deviceId + reports) are admin-only —
    // never sent to anonymous wall clients. Legacy shape stays intact otherwise.
    let select = "-deviceId -reportedCount -reportedBy";

    if (moderation) {
      // Admin/staff-only moderation view — the mobile app's Reported/Hidden
      // tabs. Hidden requests stay reachable (for un-hide) and the moderation
      // fields are included so the app can offer the same actions as the
      // dashboard without a separate screen.
      const auth = await requireApprovedUser(req);
      if (!auth.ok) {
        return authFailureResponse(auth);
      }
      if (!MODERATOR_ROLES.includes(auth.user!.role)) {
        return NextResponse.json(
          { success: false, error: "Forbidden" },
          { status: 403 },
        );
      }
      select = "";
      if (status === "reported") {
        query.reportedCount = { $gt: 0 };
      } else if (status === "hidden") {
        query.hidden = true;
      } else if (status === "live") {
        query.hidden = false;
        query.reportedCount = 0;
      } else {
        // "all" — show every request, hidden ones included.
        delete query.hidden;
      }
    }

    // Load blocked device ids once so each moderation item can be annotated
    // with its block state (BlockedDevice is a separate collection).
    const blockedIds = new Set<string>();
    if (moderation) {
      const blocked = await BlockedDevice.find().select("deviceId").lean();
      for (const b of blocked) {
        const deviceId = (b as { deviceId?: string }).deviceId;
        if (deviceId) blockedIds.add(deviceId);
      }
    }

    const [total, data] = await Promise.all([
      PrayerRequest.countDocuments(query),
      PrayerRequest.find(query)
        .select(select)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    const finalData = moderation
      ? data.map((r: any) => ({
          ...r,
          blocked: blockedIds.has(r.deviceId ?? ""),
        }))
      : data;

    const start = (page - 1) * limit;
    return NextResponse.json({
      success: true,
      data: finalData,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: start + data.length < total,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}

// POST /api/prayer-requests -> submit a prayer request (public, no auth).
//
// Anyone can post — the wall is intentionally unmoderated at submission.
// `name` is optional: omit it (or send an empty string) to submit anonymously.
// A trimmed message is required.
//
// DEV-29: `deviceId` (the same anonymous device id used for "pray"/RSVP/
// reactions) is recorded on the request so content moderation can block the
// submitting device when the request has no identifiable user. A blocked
// device is rejected here with 403.
export async function POST(req: NextRequest) {
  try {
    // DEV-30: public write — throttle prayer request submissions per IP so the
    // public wall can't be spammed (each request is also length-capped below).
    const rl = await checkRateLimit(req, {
      key: "prayer-requests.submit",
      ...RATE_LIMITS.prayerSubmit,
    });
    if (!rl.ok) return rateLimitResponse(rl.retryAfterSeconds);

    await connectDB();
    const body = await req.json().catch(() => ({}));

    const message = typeof body.message === "string" ? body.message.trim() : "";
    const name =
      typeof body.name === "string" && body.name.trim().length > 0
        ? body.name.trim()
        : null;
    const deviceId =
      typeof body.deviceId === "string" ? body.deviceId.trim() : "";

    if (!message) {
      return NextResponse.json(
        { success: false, error: "message is required" },
        { status: 400 },
      );
    }
    if (message.length > 2000) {
      return NextResponse.json(
        { success: false, error: "message must be 2000 characters or fewer" },
        { status: 400 },
      );
    }

    // DEV-29: device-level moderation block (no user account exists to block
    // on this public surface). Only enforced when the client sent a deviceId.
    if (deviceId && (await isDeviceBlocked(deviceId))) {
      return NextResponse.json(
        {
          success: false,
          error:
            "This device is blocked from posting prayer requests. Contact the church if you believe this is a mistake.",
        },
        { status: 403 },
      );
    }

    const prayerRequest = await PrayerRequest.create({
      name,
      message,
      deviceId: deviceId || null,
    });

    return NextResponse.json(
      { success: true, data: prayerRequest },
      { status: 201 },
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}
