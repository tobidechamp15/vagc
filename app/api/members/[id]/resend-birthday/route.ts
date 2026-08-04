import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Member from "@/models/Member";
import BirthdayEmailLog from "@/models/BirthdayEmailLog";
import { sendBirthdayEmail } from "@/lib/email";
import { requireApprovedUser, authFailureResponse } from "@/lib/auth";
import { logActivity, getRequestMeta } from "@/lib/activity";

// POST /api/members/:id/resend-birthday
// Manual admin trigger: sends the birthday email for a single member on demand,
// on any day — so a send that was missed or failed (e.g. the daily/hourly cron
// didn't get to it) can still be triggered manually. It will not re-send if the
// email was already successfully sent this year (prevents double sends).
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return authFailureResponse(auth);
  }
  const actor = auth.user!;

  try {
    await connectDB();
    const member = await Member.findById(params.id);
    if (!member) {
      return NextResponse.json(
        { success: false, error: "Member not found" },
        { status: 404 },
      );
    }

    const now = new Date();
    const year = now.getFullYear();

    if (member.birthdaySentYear === year) {
      return NextResponse.json(
        {
          success: false,
          error: "The birthday email was already sent this year.",
        },
        { status: 400 },
      );
    }

    try {
      await sendBirthdayEmail(member.gmail, member.fullName);
      member.birthdaySent = true;
      member.birthdaySentDate = now;
      member.birthdaySentYear = year;
      member.birthdayStatus = "sent";
      member.birthdayStatusYear = year;
      await member.save();

      await BirthdayEmailLog.create({
        memberId: member._id,
        memberName: member.fullName,
        email: member.gmail,
        sentDate: now,
        status: "sent",
      });

      // Audit: who manually resent the notification.
      await logActivity({
        actor,
        action: "NOTIFICATION_RESEND",
        targetId: member._id.toString(),
        targetName: member.fullName,
        meta: getRequestMeta(req),
      });

      return NextResponse.json({ success: true, data: member });
    } catch (sendErr: any) {
      await Member.updateOne(
        { _id: member._id },
        { $set: { birthdayStatus: "failed", birthdayStatusYear: year } },
      );
      await BirthdayEmailLog.create({
        memberId: member._id,
        memberName: member.fullName,
        email: member.gmail,
        sentDate: now,
        status: "failed",
        errorMessage: sendErr.message,
      });

      await logActivity({
        actor,
        action: "NOTIFICATION_RESEND",
        targetId: member._id.toString(),
        targetName: member.fullName,
        changes: { status: { from: "sent", to: "failed" } },
        meta: getRequestMeta(req),
      });

      return NextResponse.json(
        { success: false, error: sendErr.message },
        { status: 500 },
      );
    }
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}
