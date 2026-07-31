import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import { getAuthUser } from "@/lib/auth";

// GET /api/auth/me -> current user's profile (requires Bearer token)
export async function GET(req: NextRequest) {
  const authUser = getAuthUser(req);
  if (!authUser) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    await connectDB();
    const user = await User.findById(authUser.userId).select("-passwordHash -resetToken -resetTokenExpiry");
    if (!user) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: user });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
