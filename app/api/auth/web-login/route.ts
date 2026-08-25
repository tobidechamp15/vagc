import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import { signToken, isSuperAdminEmail } from "@/lib/auth";
import { setSessionCookie } from "@/lib/session";
import { logActivity, getRequestMeta } from "@/lib/activity";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rateLimit";

// POST /api/auth/web-login  { email, password }
// Used by the Next.js dashboard. On success it sets an httpOnly session cookie
// (the mobile app keeps using the Bearer-token /api/auth/login endpoint).
export async function POST(req: NextRequest) {
  try {
    // DEV-30: public write — brute-force protection per IP (same as mobile login).
    const rl = await checkRateLimit(req, {
      key: "auth.web-login",
      ...RATE_LIMITS.login,
    });
    if (!rl.ok) return rateLimitResponse(rl.retryAfterSeconds);

    await connectDB();
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: "Email and password are required" },
        { status: 400 },
      );
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Invalid email or password" },
        { status: 401 },
      );
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json(
        { success: false, error: "Invalid email or password" },
        { status: 401 },
      );
    }

    // The web dashboard is for approved admins only.
    // Legacy accounts (created before approval existed) have no status —
    // treat them as approved so existing admins aren't locked out.
    const status: "pending" | "approved" | "rejected" =
      user.status || "approved";
    // The super-admin account is exempt from status restrictions.
    if (status !== "approved" && !isSuperAdminEmail(user.email)) {
      const msg =
        status === "rejected"
          ? "Your account was rejected. Please contact the administrator."
          : "Your account is pending approval.";
      return NextResponse.json({ success: false, error: msg }, { status: 403 });
    }

    const token = signToken({
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
      name: user.fullName,
    });
    setSessionCookie(token);

    // Audit: record the dashboard login too (same actor logging as mobile).
    await logActivity({
      actor: {
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
        name: user.fullName,
      },
      action: "LOGIN",
      meta: getRequestMeta(req),
    });

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
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
