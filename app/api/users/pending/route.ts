import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import { requireApprovedUser, authFailureResponse } from "@/lib/auth";

// GET /api/users/pending -> accounts awaiting approval (admin only)
export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) return authFailureResponse(auth);
  if (auth.user!.role !== "admin") {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  }

  try {
    await connectDB();
    const users = await User.find({ status: "pending" })
      .select("-passwordHash -resetToken -resetTokenExpiry")
      .sort({ createdAt: 1 });
    return NextResponse.json({ success: true, data: users });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}
