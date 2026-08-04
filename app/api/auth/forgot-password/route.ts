import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import { isSuperAdminEmail } from "@/lib/auth";
import { getTransporter, EMAIL_USER } from "@/lib/email";

// POST /api/auth/forgot-password  { email }
// Always responds success (so we don't leak which emails are registered),
// but only actually emails a reset code if the account exists.
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const { email } = await req.json();
    if (!email) {
      return NextResponse.json(
        { success: false, error: "Email is required" },
        { status: 400 },
      );
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    // Rejected accounts (except the super-admin) cannot request a reset.
    if (user && user.status === "rejected" && !isSuperAdminEmail(user.email)) {
      return NextResponse.json(
        {
          success: false,
          error: "Your account was rejected. Please contact the administrator.",
        },
        { status: 403 },
      );
    }

    if (user) {
      const resetCode = crypto.randomInt(100000, 999999).toString(); // 6-digit code
      user.resetToken = resetCode;
      user.resetTokenExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
      await user.save();

      const churchName = process.env.CHURCH_NAME || "Our Church";
      const transporter = getTransporter();
      await transporter.sendMail({
        from: `"${churchName}" <${EMAIL_USER}>`,
        to: user.email,
        subject: "Reset your password",
        html: `<p>Hi ${user.fullName},</p><p>Your password reset code is:</p><h2>${resetCode}</h2><p>This code expires in 15 minutes.</p>`,
      });
    }

    return NextResponse.json({
      success: true,
      message:
        "If an account exists for that email, a reset code has been sent.",
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}
