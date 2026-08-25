import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import { signToken, isSuperAdminEmail } from "@/lib/auth";
import { logActivity, getRequestMeta } from "@/lib/activity";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rateLimit";

// POST /api/auth/login  { email, password }
export async function POST(req: NextRequest) {
  try {
    // DEV-30: public write — brute-force protection per IP.
    const rl = await checkRateLimit(req, {
      key: "auth.login",
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

    // Rejected accounts cannot sign in — except the super-admin account.
    if (user.status === "rejected" && !isSuperAdminEmail(user.email)) {
      return NextResponse.json(
        {
          success: false,
          error: "Your account was rejected. Please contact the administrator.",
        },
        { status: 403 },
      );
    }

    const token = signToken({
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
      name: user.fullName,
    });

    // Audit: record every successful login (mobile and web) with a timestamp.
    // Pending accounts are allowed to log in so the app can show the
    // "pending review" screen, but they cannot access any data until approved.
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
        token,
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
          status: user.status,
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
