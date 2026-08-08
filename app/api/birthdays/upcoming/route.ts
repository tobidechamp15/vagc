import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Member from "@/models/Member";
import { requireApprovedUser, authFailureResponse } from "@/lib/auth";

// GET /api/birthdays/upcoming?days=7
// -> members whose birthday (month/day) falls within the next `days` days
//    (excluding today), ordered by soonest first (tomorrow, then +2 days, …).
//    Used by the home screen's "Upcoming Birthdays" section.
export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return authFailureResponse(auth);
  }
  try {
    await connectDB();
    const days = Math.min(
      60,
      Math.max(
        1,
        parseInt(req.nextUrl.searchParams.get("days") || "7", 10) || 7,
      ),
    );

    // Build the "MM-DD" keys for tomorrow..today+days. Starting at i=1 (not 0)
    // keeps today's birthdays out of this list — they have their own section.
    const now = new Date();
    const mmddSet: string[] = [];
    for (let i = 1; i <= days; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      mmddSet.push(`${mm}-${dd}`);
    }

    const members = await Member.find({
      $expr: { $in: [{ $substrCP: ["$dateOfBirth", 5, 5] }, mmddSet] },
    }).lean();

    // Sort by soonest upcoming birthday (tomorrow first). The index in
    // mmddSet IS the number of days from today, so it doubles as the sort key.
    const sorted = [...members].sort((a: any, b: any) => {
      const keyA = mmddSet.indexOf(a.dateOfBirth?.slice(5, 10));
      const keyB = mmddSet.indexOf(b.dateOfBirth?.slice(5, 10));
      return (
        (keyA === -1 ? Number.MAX_SAFE_INTEGER : keyA) -
        (keyB === -1 ? Number.MAX_SAFE_INTEGER : keyB)
      );
    });

    return NextResponse.json({ success: true, data: sorted });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}
