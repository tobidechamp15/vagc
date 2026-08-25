/**
 * One-off script: explicitly create every index declared across the Mongoose
 * models.
 *
 * Usage:
 *   node scripts/create-indexes.js
 *
 * (or `npm run create:indexes`)
 *
 * WHY THIS EXISTS
 * ---------------
 * `connectDB()` (lib/mongodb.ts) runs with `autoIndex: false` in production,
 * so Mongoose will NOT auto-create schema-declared indexes on connect there.
 * This script is the explicit, deploy-time step that turns the indexes declared
 * in models/*.ts into real MongoDB indexes.
 *
 * It MUST be run against the production database BEFORE deploying code that
 * relies on a new index (see backend/README.md → Deploy). If you add or change
 * an index in a model, update the INDEXES map below to match, then run this
 * script as part of that deploy.
 *
 * Idempotent: MongoDB treats creating an already-existing identical index as a
 * no-op, so re-running after a schema change only creates the new indexes.
 *
 * Same conventions as scripts/backfill-next-birthday-ordinal.js: parses
 * .env.local manually, uses the raw driver via mongoose.connection.db, and
 * stays plain CommonJS so it runs without a build step.
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

/**
 * Every index declared across the Mongoose schemas, keyed by collection name
 * (Mongoose's default pluralized-lowercase name for each model).
 *
 * Each entry is `{ key, options }` mirroring the schema declaration exactly:
 *   - `unique: true`            from a `unique: true` schema field
 *   - `expireAfterSeconds: 0`   from a TTL `schema.index(..., { expireAfterSeconds })`
 *   - `"text"`                  from a text index
 *
 * If you add/change an index in a model, update this map to match — and run
 * `npm run create:indexes` against production as part of the deploy.
 */
const INDEXES = {
  // models/Member.ts
  members: [
    // Directory sort: ascending ordinal = closest upcoming birthday first;
    // `_id` tiebreaker keeps skip/limit pagination stable on shared birthdays.
    { key: { nextBirthdayOrdinal: 1, _id: 1 } },
    // Directory search by name / email / phone.
    { key: { fullName: "text", gmail: "text", phoneNumber: "text" } },
  ],

  // models/ActivityLog.ts
  activitylogs: [
    { key: { action: 1, timestamp: -1 } },
    { key: { actorId: 1, timestamp: -1 } },
    { key: { targetId: 1, timestamp: -1 } },
    { key: { timestamp: -1 } },
  ],

  // models/User.ts (unique `email` field)
  users: [{ key: { email: 1 }, options: { unique: true } }],

  // models/Post.ts
  posts: [
    { key: { deleted: 1, publishedAt: -1 } },
    { key: { publishedAt: -1 } },
    { key: { "reactedBy.deviceId": 1 } },
  ],

  // models/PrayerRequest.ts
  prayerrequests: [
    { key: { hidden: 1, createdAt: -1 } },
    { key: { reportedCount: -1, createdAt: -1 } },
    { key: { "prayedBy.deviceId": 1 } },
    { key: { "reportedBy.deviceId": 1 } },
  ],

  // models/SupportTicket.ts
  supporttickets: [
    { key: { status: 1, createdAt: -1 } },
    { key: { deviceId: 1, createdAt: -1 } },
  ],

  // models/RateLimit.ts
  ratelimits: [
    // Exact-key bucket lookups (findOneAndUpdate) — the unique index covers the query.
    { key: { key: 1 }, options: { unique: true } },
    // Auto-delete expired buckets (TTL index).
    { key: { expiresAt: 1 }, options: { expireAfterSeconds: 0 } },
  ],

  // models/Event.ts
  events: [
    { key: { deleted: 1, startsAt: 1 } },
    { key: { startsAt: 1 } },
    { key: { "rsvps.deviceId": 1 } },
  ],

  // models/Device.ts
  devices: [
    // Stable anonymous device id — unique per physical device.
    { key: { deviceId: 1 }, options: { unique: true } },
    // Allow-list lookups (`{ userId: { $in: [...] } }`) in sendPushNotification.
    { key: { userId: 1 } },
  ],

  // models/BlockedDevice.ts
  blockeddevices: [{ key: { deviceId: 1 }, options: { unique: true } }],
};

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI not found — check backend/.env.local");
    process.exit(1);
  }

  console.log("Connecting to MongoDB…");
  await mongoose.connect(process.env.MONGODB_URI, { bufferCommands: false });
  const db = mongoose.connection.db;

  let total = 0;
  for (const [collectionName, specs] of Object.entries(INDEXES)) {
    const collection = db.collection(collectionName);
    // `createIndexes` builds every index for a collection in one command, and
    // silently skips ones that already exist (idempotent).
    const toCreate = specs.map((s) => ({ key: s.key, ...(s.options || {}) }));

    try {
      const created = await collection.createIndexes(toCreate);
      total += created.length;
      console.log(
        `  ${collectionName}: ${created.length} index(es) OK [${created.join(", ")}]`,
      );
    } catch (e) {
      console.error(`  ${collectionName}: FAILED — ${e.message}`);
      throw e;
    }
  }

  console.log(
    `\nDone. ${total} index(es) ensured across ${Object.keys(INDEXES).length} collection(s).`,
  );

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error("create-indexes error:", e);
  process.exit(1);
});
