import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Member from "@/models/Member";
import BirthdayEmailLog from "@/models/BirthdayEmailLog";
import { sendBirthdayEmail } from "@/lib/email";
import { daysUntilNextBirthday } from "@/lib/birthdaySort";
import { logger } from "@/lib/logger";

// Maximum number of automatic send attempts per member per year. Without a cap
// an hourly cron would hammer permanently-bad addresses (e.g. a typo'd email)
// 24 times a day and flood the BirthdayEmailLog with failures.
const MAX_RETRIES = 5;

// ── Cron deduplication lock ────────────────────────────────────────────
// Vercel Cron guarantees single-delivery (one request per scheduled tick),
// so this lock is a no-op in production. It exists for self-hosted /
// multi-instance deployments where multiple cron triggers could fire
// simultaneously. The lock auto-expires after 55 minutes (hourly cron
// minus 5 min safety margin) so a crashed run never blocks the next tick.
const LOCK_TTL_MS = 55 * 60 * 1000; // 55 minutes
// nextBirthdayOrdinal decays at midnight, so it only needs refreshing about
// once a day. A 23-hour lock on the hourly cron means one refresh per day
// (with a safety margin so a crashed run never blocks the next tick).
const ORDINAL_LOCK_TTL_MS = 23 * 60 * 60 * 1000; // 23 hours
const ORDINAL_CHUNK = 500; // bulkWrite batch size (free-tier Atlas friendly)

/**
 * Distributed lock on the cron_locks collection. Used to deduplicate work
 * across self-hosted / multi-instance deployments (Vercel Cron delivers a
 * single request per tick, so this is a no-op there).
 *
 * A lock that hasn't expired means another instance already did this work, so
 * this run skips it. Expired locks (crashed runs) are taken over and renewed.
 */
async function acquireLock(name: string, ttlMs: number): Promise<boolean> {
  try {
    const db = (await connectDB()).connection.db!;
    const now = new Date();

    // Atomically upsert the lock and ask the driver to report whether THIS
    // call inserted it. returnDocument: "before" keeps `value` as the
    // PRE-update document, so on the update path we can still read the
    // previous expiresAt even though $set already wrote the new one.
    //
    // This fixes a first-ever-acquisition bug: the old code inferred
    // "already locked" from `expiresAt > now` on the returned document, but a
    // fresh insert (upsert) also has a future expiresAt, so the very first
    // call misread its own insert as a held lock and returned false.
    const raw = await db.collection("cron_locks").findOneAndUpdate(
      { name },
      {
        $set: {
          name,
          acquiredAt: now,
          expiresAt: new Date(now.getTime() + ttlMs),
        },
      },
      { upsert: true, returnDocument: "before", includeResultMetadata: true },
    );

    // This call created the lock (nothing existed before) — we own it.
    if (!raw?.lastErrorObject?.updatedExisting) return true;

    // An existing lock. `value` is the PRE-update document: if its expiresAt
    // was already in the future, another instance still holds the lock (and
    // this run must skip); if it was in the past, this call just renewed it.
    const prevExpires = raw.value?.expiresAt;
    const expiresAt =
      prevExpires instanceof Date ? prevExpires : new Date(prevExpires);
    return expiresAt <= now;
  } catch {
    // If the locks collection doesn't exist yet or there's a transient error,
    // allow the cron to proceed — better to risk a duplicate than skip entirely.
    return true;
  }
}

const acquireCronLock = () => acquireLock("birthday-check", LOCK_TTL_MS);

/**
 * Recomputes nextBirthdayOrdinal for EVERY member. Because the value means
 * "days until the next birthday from today", it decays at midnight — without
 * this refresh the indexed directory sort would go stale within a day and
 * reorder pages. Runs about once a day (guarded by a 23-hour lock).
 */
async function refreshBirthdayOrdinals(): Promise<number> {
  const members = await Member.find({}).select("_id dateOfBirth").lean();
  let count = 0;
  for (let i = 0; i < members.length; i += ORDINAL_CHUNK) {
    const slice = members.slice(i, i + ORDINAL_CHUNK);
    await Member.bulkWrite(
      slice.map((m: any) => ({
        updateOne: {
          filter: { _id: m._id },
          update: {
            $set: { nextBirthdayOrdinal: daysUntilNextBirthday(m.dateOfBirth) },
          },
        },
      })),
    );
    count += slice.length;
  }
  return count;
}

// GET /api/cron/birthday-check
// Runs HOURLY (see vercel.json) so that:
//   - birthday emails go out as soon as possible on the member's birthday, and
//   - any pending/failed sends are retried every hour instead of once a day.
// Idempotent: a member is only emailed once per year (guarded by birthdaySentYear)
// and never before their birthday (month/day must be today or already passed).
// Protect with CRON_SECRET so it can't be hit by anyone else.
//
// On Vercel: Cron Jobs deliver exactly one request per scheduled tick.
// On self-hosted / Kubernetes: if multiple cron triggers fire simultaneously,
// the acquireCronLock() guard ensures only one instance processes the batch.
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

    // ── Distributed lock: prevent duplicate runs in multi-instance deployments.
    // On Vercel Cron this is a no-op (single delivery). On self-hosted / K8s,
    // if two cron pods fire at the same time, only one acquires the lock.
    const locked = await acquireCronLock();
    if (!locked) {
      return NextResponse.json({
        success: true,
        message: "Skipped — another instance is already processing this tick.",
      });
    }

    // ── Daily ordinal refresh (~once a day, guarded by a 23-hour lock) ──
    // nextBirthdayOrdinal decays at midnight; refreshing it here keeps the
    // member directory's indexed birthday sort from going stale. Runs early so
    // it happens even if the email-send loop below errors out, and is wrapped
    // in its own try/catch so a refresh failure can NEVER abort the birthday
    // email path (previously any error here would 500 the whole tick).
    const ordinalLocked = await acquireLock(
      "birthday-ordinal-refresh",
      ORDINAL_LOCK_TTL_MS,
    );
    let ordinalRefreshed = 0;
    if (ordinalLocked) {
      try {
        ordinalRefreshed = await refreshBirthdayOrdinals();
      } catch (err: any) {
        logger.error("Birthday ordinal refresh failed", {
          error: err.message,
        });
      }
    }

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
      ordinalRefreshed,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}
