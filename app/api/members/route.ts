import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Member from "@/models/Member";
import { getAuthUser } from "@/lib/auth";

// GET /api/members            -> list all members
// GET /api/members?q=john     -> search members by name/email/phone
export async function GET(req: NextRequest) {
  if (!getAuthUser(req)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    await connectDB();
    const q = req.nextUrl.searchParams.get("q");

    const filter = q
      ? {
          $or: [
            { fullName: { $regex: q, $options: "i" } },
            { gmail: { $regex: q, $options: "i" } },
            { phoneNumber: { $regex: q, $options: "i" } },
          ],
        }
      : {};

    const members = await Member.find(filter).sort({ fullName: 1 });
    return NextResponse.json({ success: true, data: members });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// POST /api/members -> create a new member
export async function POST(req: NextRequest) {
  if (!getAuthUser(req)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    await connectDB();
    const body = await req.json();

    const { fullName, phoneNumber, address, dateOfBirth, gmail } = body;
    if (!fullName || !phoneNumber || !address || !dateOfBirth || !gmail) {
      return NextResponse.json(
        { success: false, error: "All fields (fullName, phoneNumber, address, dateOfBirth, gmail) are required" },
        { status: 400 }
      );
    }

    const member = await Member.create({ fullName, phoneNumber, address, dateOfBirth, gmail });
    return NextResponse.json({ success: true, data: member }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
