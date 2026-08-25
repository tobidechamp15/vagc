/**
 * Behavioral test for the acquireLock() fix in app/api/cron/birthday-check/route.ts.
 *
 * Verifies against a real MongoDB (defaults to backend/.env.local's MONGODB_URI):
 *   1. First-ever acquisition (no cron_locks doc for that name) -> true
 *      — this is the bug being fixed: the old code read its own fresh
 *        insert's future expiresAt as "already locked" and returned false.
 *   2. Second call within the TTL window                        -> false (blocked)
 *   3. Call after the lock expired                              -> true  (renewed)
 *   4. A fresh lock under a DIFFERENT name                      -> true
 *      — covers the ordinal-refresh lock, since both call sites (acquireCronLock
 *        and the daily ordinal refresh) share the generalized acquireLock().
 *
 * WARNING: this drops the `cron_locks` collection. It is ephemeral lock
 * metadata and is recreated by the first cron run, so this is safe — but run
 * it only against a database you're OK touching.
 *
 * Usage:
 *   node scripts/test-cron-lock.js
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

const TTL_MS = 2000;

/**
 * Mirrors acquireLock() from app/api/cron/birthday-check/route.ts exactly
 * (same findOneAndUpdate call, upsert, returnDocument "before",
 * includeResultMetadata) so this test exercises the identical driver path.
 */
async function acquireLock(db, name, ttlMs) {
  const now = new Date();
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

  // This call inserted the lock (nothing existed before) — we own it.
  if (!raw?.lastErrorObject?.updatedExisting) return true;

  // Existing lock: `value` is the PRE-update document, so its expiresAt tells
  // us whether the lock was still held (block) or already expired (renew).
  const prevExpires = raw.value?.expiresAt;
  const expiresAt =
    prevExpires instanceof Date ? prevExpires : new Date(prevExpires);
  return expiresAt <= now;
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI not found — check backend/.env.local");
    process.exit(1);
  }

  console.log("Connecting to MongoDB…");
  await mongoose.connect(process.env.MONGODB_URI, { bufferCommands: false });
  const db = mongoose.connection.db;
  const col = db.collection("cron_locks");

  // Fresh start: remove ALL existing locks so the first call is a true
  // first-ever acquisition. (cron_locks is ephemeral; cron recreates it.)
  await col.drop().catch(() => {});

  let ok = true;
  const check = (label, got, expected) => {
    const pass = got === expected;
    ok = ok && pass;
    console.log(
      `${pass ? "PASS" : "FAIL"}  ${label}: got ${got}, expected ${expected}`,
    );
  };

  const first = await acquireLock(db, "test-lock", TTL_MS);
  check("first-ever acquisition returns true", first, true);

  const second = await acquireLock(db, "test-lock", TTL_MS);
  check("second call within TTL is blocked (false)", second, false);

  await new Promise((r) => setTimeout(r, TTL_MS + 500));
  const afterExpiry = await acquireLock(db, "test-lock", TTL_MS);
  check("call after expiry renews and returns true", afterExpiry, true);

  const otherName = await acquireLock(db, "test-lock-2", TTL_MS);
  check("fresh lock under a different name returns true", otherName, true);

  // Clean up the test locks; leave cron_locks recreated & empty of test docs.
  await col.deleteMany({ name: { $in: ["test-lock", "test-lock-2"] } });

  console.log(ok ? "\nALL PASSED" : "\nSOME FAILED");
  await mongoose.disconnect();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("Test error:", e);
  process.exit(1);
});
