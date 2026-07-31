import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Member from "@/models/Member";
import { getAuthUser } from "@/lib/auth";

// GET /api/birthdays/today -> members whose birthday (month/day) is today
export async function GET(req: NextRequest) {
  if (!getAuthUser(req)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    await connectDB();
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    const members = await Member.find({
      $expr: {
        $eq: [{ $substrCP: ["$dateOfBirth", 5, 5] }, `${month}-${day}`],
      },
    });

    return NextResponse.json({ success: true, data: members });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
