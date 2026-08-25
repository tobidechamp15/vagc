import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import { getAuthUser } from "@/lib/auth";

// ALLOWED profile fields that a user can update about themselves
const ALLOWED_FIELDS = new Set([
  "fullName",
  "preferredName",
  "dateOfBirth",
  "gender",
  "phoneNumber",
  "address",
  "maritalStatus",
  // Profile photo (avatarUrl) — a Cloudinary secure_url returned by the
  // DEV-17 direct-upload flow. Kept on the User model (IUser.avatarUrl).
  "avatarUrl",
]);

// PUT /api/auth/me/profile — update own profile fields
export async function PUT(req: NextRequest) {
  const authUser = getAuthUser(req);
  if (!authUser) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const body = await req.json();

    // Only allow whitelisted fields
    const updates: Record<string, unknown> = {};
    for (const key of ALLOWED_FIELDS) {
      if (key in body && body[key] !== undefined) {
        updates[key] = body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, error: "No valid fields to update" },
        { status: 400 },
      );
    }

    // Basic email validation if email is being changed (email comes from auth, not profile)
    if (updates.phoneNumber && typeof updates.phoneNumber === "string") {
      // Strip non-numeric chars for storage
      updates.phoneNumber = (updates.phoneNumber as string)
        .replace(/[^\d+\-() ]/g, "")
        .trim();
    }

    await connectDB();
    const user = await User.findByIdAndUpdate(
      authUser.userId,
      { $set: updates },
      { new: true, runValidators: true },
    ).select("-passwordHash -resetToken -resetTokenExpiry");

    if (!user) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: user });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}
