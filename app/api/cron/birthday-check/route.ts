import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Member from "@/models/Member";
import BirthdayEmailLog from "@/models/BirthdayEmailLog";
import { sendBirthdayEmail } from "@/lib/email";

// GET /api/cron/birthday-check
// Triggered daily (e.g. by Vercel Cron, see vercel.json) at 08:00.
// Protect with CRON_SECRET so it can't be hit by anyone else.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectDB();
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const year = now.getFullYear();

    const members = await Member.find({
      $expr: {
        $eq: [{ $substrCP: ["$dateOfBirth", 5, 5] }, `${month}-${day}`],
      },
      birthdaySentYear: { $ne: year }, // don't double-send within the same year
    });

    const results = [];

    for (const member of members) {
      try {
        await sendBirthdayEmail(member.gmail, member.fullName);
        member.birthdaySent = true;
        member.birthdaySentDate = now;
        member.birthdaySentYear = year;
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
        await BirthdayEmailLog.create({
          memberId: member._id,
          memberName: member.fullName,
          email: member.gmail,
          sentDate: now,
          status: "failed",
          errorMessage: emailErr.message,
        });
        results.push({ member: member.fullName, status: "failed", error: emailErr.message });
      }
    }

    return NextResponse.json({ success: true, checked: members.length, results });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
