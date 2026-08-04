import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import { requireApprovedUser, authFailureResponse } from "@/lib/auth";
import { logActivity, getRequestMeta } from "@/lib/activity";

// POST /api/users/:id/reject -> reject a pending account (admin only)
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
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
    const target = await User.findByIdAndUpdate(
      params.id,
      { $set: { status: "rejected" } },
      { new: true },
    ).select("-passwordHash -resetToken -resetTokenExpiry");
    if (!target) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 },
      );
    }

    await logActivity({
      actor: auth.user!,
      action: "ACCOUNT_REJECT",
      targetId: target._id.toString(),
      targetName: target.fullName || target.email,
      meta: getRequestMeta(req),
    });

    return NextResponse.json({ success: true, data: target });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}
