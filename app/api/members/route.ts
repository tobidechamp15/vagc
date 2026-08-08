import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Member from "@/models/Member";
import { requireApprovedUser, authFailureResponse } from "@/lib/auth";
import { logActivity, getRequestMeta } from "@/lib/activity";
import { sortByUpcomingBirthday } from "@/lib/birthdaySort";

// GET /api/members                       -> list members (paginated)
// GET /api/members?q=john                -> search members by name/email/phone
// GET /api/members?page=2&limit=8        -> paginate (page is 1-based, default limit 8)
export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return authFailureResponse(auth);
  }
  try {
    await connectDB();
    const q = req.nextUrl.searchParams.get("q");

    const page = Math.max(
      1,
      parseInt(req.nextUrl.searchParams.get("page") || "1", 10) || 1,
    );
    const limit = Math.min(
      100,
      Math.max(
        1,
        parseInt(req.nextUrl.searchParams.get("limit") || "8", 10) || 8,
      ),
    );

    const filter = q
      ? {
          $or: [
            { fullName: { $regex: q, $options: "i" } },
            { gmail: { $regex: q, $options: "i" } },
            { phoneNumber: { $regex: q, $options: "i" } },
          ],
        }
      : {};

    const [total, all] = await Promise.all([
      Member.countDocuments(filter),
      Member.find(filter).lean(),
    ]);

    // Order members by their closest upcoming birthday (today's first), then
    // slice out only the requested page so the client gets small batches.
    const sorted = sortByUpcomingBirthday(all);
    const start = (page - 1) * limit;
    const data = sorted.slice(start, start + limit);

    return NextResponse.json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: start + data.length < total,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}

// POST /api/members -> create a new member
export async function POST(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return authFailureResponse(auth);
  }
  const actor = auth.user!;
  try {
    await connectDB();
    const body = await req.json();

    const { fullName, phoneNumber, address, dateOfBirth, gmail } = body;
    if (!fullName || !phoneNumber || !address || !dateOfBirth || !gmail) {
      return NextResponse.json(
        {
          success: false,
          error:
            "All fields (fullName, phoneNumber, address, dateOfBirth, gmail) are required",
        },
        { status: 400 },
      );
    }

    const member = await Member.create({
      fullName,
      phoneNumber,
      address,
      dateOfBirth,
      gmail,
    });

    // Audit: who added this member.
    await logActivity({
      actor,
      action: "MEMBER_CREATE",
      targetId: member._id.toString(),
      targetName: member.fullName,
      meta: getRequestMeta(req),
    });

    return NextResponse.json({ success: true, data: member }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}
