/**
 * One-off migration: backfill `nextBirthdayOrdinal` for every existing member.
 *
 * Usage:
 *   node scripts/backfill-next-birthday-ordinal.js
 *
 * (or `npm run backfill:birthday-ordinal`)
 *
 * Adds the "days until next birthday (0–365)" sort key used by the member
 * directory's indexed pagination. MUST be run once before deploying the new
 * DB-level pagination so existing records don't sort as null (which MongoDB
 * places BEFORE numbers in ascending order, i.e. at the top of every page).
 *
 * The value decays at midnight, so this is a one-time backfill — the daily
 * cron refresh (/api/cron/birthday-check) keeps it current from then on.
 *
 * Same conventions as scripts/seed-members.js: parses .env.local manually and
 * writes in batches so it works on free-tier Atlas.
 */
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

// ── Load .env.local manually (same approach as scripts/seed-members.js) ──
const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
// Mirrors lib/birthdaySort.ts: missing/invalid dates sort LAST (the old sort
// key returned Number.MAX_SAFE_INTEGER for these), so the backfill matches.
const INVALID_BIRTHDAY_ORDINAL = 3650;

/**
 * Days until the member's next birthday, mirroring lib/birthdaySort.ts exactly
 * (same this-year / next-year rule and same invalid-date sentinel) so the
 * migration produces the identical ordering the old in-memory sort produced.
 */
function daysUntilNextBirthday(dob, now = new Date()) {
  if (!dob) return INVALID_BIRTHDAY_ORDINAL;
  const parts = dob.split("-").map(Number);
  const m = parts[1];
  const d = parts[2];
  if (parts.length < 3 || !m || !d || Number.isNaN(m) || Number.isNaN(d)) {
    return INVALID_BIRTHDAY_ORDINAL;
  }
  let next = new Date(now.getFullYear(), m - 1, d);
  if (next.getTime() < now.getTime()) {
    next = new Date(now.getFullYear() + 1, m - 1, d);
  }
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((next.getTime() - todayStart.getTime()) / MS_PER_DAY);
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI not found — check backend/.env.local");
    process.exit(1);
  }

  console.log("Connecting to MongoDB…");
  await mongoose.connect(process.env.MONGODB_URI, { bufferCommands: false });
  const collection = mongoose.connection.db.collection("members");

  const members = await collection.find({}).toArray();
  console.log(`Members found: ${members.length}`);

  const BATCH = 500;
  let updated = 0;
  for (let start = 0; start < members.length; start += BATCH) {
    const chunk = members.slice(start, start + BATCH);
    const ops = chunk.map((m) => ({
      updateOne: {
        filter: { _id: m._id },
        update: {
          $set: { nextBirthdayOrdinal: daysUntilNextBirthday(m.dateOfBirth) },
        },
      },
    }));
    await collection.bulkWrite(ops);
    updated += chunk.length;
    console.log(`  updated ${updated}/${members.length}`);
  }

  console.log(`\nDone. nextBirthdayOrdinal backfilled for ${updated} members.`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error("Backfill error:", e);
  process.exit(1);
});
