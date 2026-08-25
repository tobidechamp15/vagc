import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import RateLimit from "@/models/RateLimit";

// DEV-30: fixed-window rate limiting for public write endpoints.
//
// Why MongoDB? Vercel serverless functions are ephemeral and horizontally
// scaled, so in-memory counters would be per-instance (bypassable and
// inconsistent). This backend already has MongoDB and no Redis/Upstash, so a
// small counter collection is the lowest-friction way to get a limit that is
// consistent across every function instance.
//
// How it works: each request computes the current window (Date.now() floored to
// windowMs) and atomically increments that window's counter with
// findOneAndUpdate + $inc + upsert. If the count exceeds the limit we return a
// 429 with a Retry-After header. Old buckets are auto-deleted by the TTL index
// on the RateLimit model.

export interface RateLimitOptions {
  /** Route-level namespace, e.g. "auth.login" or "rsvp". */
  key: string;
  /** Maximum requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /**
   * Optional per-request identifier (e.g. deviceId) used INSTEAD of the client
   * IP. If omitted, the client IP is used. Interaction endpoints pass the
   * deviceId so a shared office/wifi IP doesn't punish individual devices.
   */
  identifier?: string;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/** Client IP from the standard reverse-proxy headers (Vercel sets these). */
export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    // Vercel appends the real client IP; take the first hop.
    return forwarded.split(",")[0].trim();
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Checks (and consumes) one slot against the caller's rate limit.
 *
 * This should be called at the very top of a public write handler so the
 * expensive work (bcrypt, DB writes) never runs for a throttled caller.
 */
export async function checkRateLimit(
  req: NextRequest,
  opts: RateLimitOptions,
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = Math.floor(now / opts.windowMs) * opts.windowMs;
  const id = opts.identifier || getClientIp(req);
  // Prefix the IP with "ip-" so an IPv4/IPv6/v4-mapped value can't collide
  // with a deviceId that happens to look like an address.
  const bucketKey = `${opts.key}:${opts.identifier ? "dev" : "ip"}:${id}:${windowStart}`;

  await connectDB();
  const doc = await RateLimit.findOneAndUpdate(
    { key: bucketKey },
    {
      $inc: { count: 1 },
      $setOnInsert: { expiresAt: new Date(windowStart + opts.windowMs) },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  const count = doc.count;
  const remaining = Math.max(0, opts.limit - count);
  const retryAfterSeconds = Math.max(
    0,
    Math.ceil((windowStart + opts.windowMs - now) / 1000),
  );

  return { ok: count <= opts.limit, remaining, retryAfterSeconds };
}

/** Builds the standard 429 JSON response with a Retry-After header. */
export function rateLimitResponse(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { success: false, error: "Too many requests. Please try again later." },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSeconds) },
    },
  );
}

// ── Shared limit presets (documented in backend/README.md) ────────────────
//
// Each preset can be overridden with an environment variable of the form
// "<limit>:<windowMs>" (see .env.example). This lets the church tune the
// limits at deploy time without a code change. Overrides apply globally to
// every route that shares the preset.

type LimitTuple = { limit: number; windowMs: number };

function envLimit(name: string, fallback: LimitTuple): LimitTuple {
  const raw = process.env[name];
  if (!raw) return fallback;
  const match = /^(\d+):(\d+)$/.exec(raw.trim());
  if (!match) return fallback;
  const limit = parseInt(match[1], 10);
  const windowMs = parseInt(match[2], 10);
  if (limit < 1 || windowMs < 1000) return fallback;
  return { limit, windowMs };
}

export const RATE_LIMITS = {
  // Account creation — aggressive: 10 signups/hour/IP.
  register: envLimit("RATE_LIMIT_REGISTER", {
    limit: 10,
    windowMs: 60 * 60 * 1000,
  }),
  // Login brute-force protection: 20 attempts / 15 min / IP.
  login: envLimit("RATE_LIMIT_LOGIN", { limit: 20, windowMs: 15 * 60 * 1000 }),
  // Password reset email spam: 5 requests / 15 min / IP.
  forgotPassword: envLimit("RATE_LIMIT_FORGOT_PASSWORD", {
    limit: 5,
    windowMs: 15 * 60 * 1000,
  }),
  // Reset code attempts: 10 / 15 min / IP.
  resetPassword: envLimit("RATE_LIMIT_RESET_PASSWORD", {
    limit: 10,
    windowMs: 15 * 60 * 1000,
  }),
  // Prayer request submission (content creation): 10 / 10 min / IP.
  prayerSubmit: envLimit("RATE_LIMIT_PRAYER_SUBMIT", {
    limit: 10,
    windowMs: 10 * 60 * 1000,
  }),
  // Support ticket submission: same shape as prayer submit — 10 / 10 min / IP.
  supportSubmit: envLimit("RATE_LIMIT_SUPPORT_SUBMIT", {
    limit: 10,
    windowMs: 10 * 60 * 1000,
  }),
  // Idempotent taps (react / pray / rsvp): generous per-device + per-IP caps.
  // One device can only count once per target anyway; this stops a single
  // device or IP from hammering many targets.
  interactionDevice: envLimit("RATE_LIMIT_INTERACTION_DEVICE", {
    limit: 60,
    windowMs: 60 * 1000,
  }),
  interactionIp: envLimit("RATE_LIMIT_INTERACTION_IP", {
    limit: 240,
    windowMs: 60 * 1000,
  }),
} as const;
