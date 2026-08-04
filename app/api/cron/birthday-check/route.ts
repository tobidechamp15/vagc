import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Member from "@/models/Member";
import BirthdayEmailLog from "@/models/BirthdayEmailLog";
import { sendBirthdayEmail } from "@/lib/email";

// Maximum number of automatic send attempts per member per year. Without a cap
// an hourly cron would hammer permanently-bad addresses (e.g. a typo'd email)
// 24 times a day and flood the BirthdayEmailLog with failures.
const MAX_RETRIES = 5;

// GET /api/cron/birthday-check
// Runs HOURLY (see vercel.json) so that:
//   - birthday emails go out as soon as possible on the member's birthday, and
//   - any pending/failed sends are retried every hour instead of once a day.
// Idempotent: a member is only emailed once per year (guarded by birthdaySentYear)
// and never before their birthday (month/day must be today or already passed).
// Protect with CRON_SECRET so it can't be hit by anyone else.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    await connectDB();
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const year = now.getFullYear();
    const todayMD = `${month}-${day}`; // "MM-DD", zero-padded for lexicographic compare

    // Year rollover: any member whose status still refers to a previous year
    // (or was never initialized) becomes "pending" for the current year.
    // Idempotent — after the first run of a new year everyone is on the current year.
    await Member.updateMany(
      { birthdayStatusYear: { $ne: year } },
      { $set: { birthdayStatus: "pending", birthdayStatusYear: year } },
    );

    // Members to email this run:
    //   - never sent this year (birthdaySentYear !== year),
    //   - status pending or failed (don't touch "sent"),
    //   - birthday month/day is today or already passed this year (never send early).
    // Because the cron runs hourly, a failed or missed send keeps matching on
    // subsequent runs until it succeeds or MAX_RETRIES is reached.
    const candidates = await Member.find({
      birthdaySentYear: { $ne: year },
      birthdayStatus: { $in: ["pending", "failed"] },
      $expr: {
        $lte: [{ $substrCP: ["$dateOfBirth", 5, 5] }, todayMD],
      },
    });

    // Skip members who already exhausted their automatic retries for the year.
    // (Legacy docs without the field count as 0 retries.)
    const members = candidates.filter(
      (m: any) => (m.birthdayRetryCount || 0) < MAX_RETRIES,
    );

    const results = [];

    for (const member of members) {
      try {
        await sendBirthdayEmail(member.gmail, member.fullName);
        member.birthdaySent = true;
        member.birthdaySentDate = now;
        member.birthdaySentYear = year;
        member.birthdayStatus = "sent";
        member.birthdayStatusYear = year;
        member.birthdayRetryCount = 0;
        await member.save();

        await BirthdayEmailLog.create({
          memberId: member._id,
          memberName: member.fullName,
          email: member.gmail,
          sentDate: now,
          status: "sent",
        });
        results.push({ member: member.fullName, status: "sent" });
      } catch (emailErr: any) {
        const retries = (member.birthdayRetryCount || 0) + 1;
        await BirthdayEmailLog.create({
          memberId: member._id,
          memberName: member.fullName,
          email: member.gmail,
          sentDate: now,
          status: "failed",
          errorMessage: emailErr.message,
        });
        // Persist the failed status and bump the retry counter. birthdaySentYear is
        // intentionally left unset so the next hourly run retries this member.
        await Member.updateOne(
          { _id: member._id },
          {
            $set: {
              birthdayStatus: "failed",
              birthdayStatusYear: year,
              birthdayRetryCount: retries,
            },
          },
        );
        results.push({
          member: member.fullName,
          status: "failed",
          error: emailErr.message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      checked: members.length,
      results,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}
