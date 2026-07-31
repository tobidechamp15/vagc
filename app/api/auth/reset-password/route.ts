import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";

// POST /api/auth/reset-password  { email, code, newPassword }
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const { email, code, newPassword } = await req.json();

    if (!email || !code || !newPassword) {
      return NextResponse.json(
        { success: false, error: "email, code and newPassword are required" },
        { status: 400 }
      );
    }
    if (newPassword.length < 6) {
      return NextResponse.json({ success: false, error: "Password must be at least 6 characters" }, { status: 400 });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (
      !user ||
      !user.resetToken ||
      user.resetToken !== code ||
      !user.resetTokenExpiry ||
      user.resetTokenExpiry < new Date()
    ) {
      return NextResponse.json({ success: false, error: "Invalid or expired reset code" }, { status: 400 });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.resetToken = null;
    user.resetTokenExpiry = null;
    await user.save();

    return NextResponse.json({ success: true, message: "Password updated successfully" });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
