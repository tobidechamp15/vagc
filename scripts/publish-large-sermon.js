/**
 * Publish a large sermon video (>100 MB) as a new post WITHOUT the mobile app.
 *
 * Background: the mobile uploader caps files at 100 MB because it only implements
 * Cloudinary's DIRECT (single-request) upload path. This script performs a manual
 * CHUNKED upload to Cloudinary (>100 MB supported), then creates the post through
 * the normal API, so the released Play Store app shows/streams the sermon with NO
 * app update.
 *
 * Why manual chunking instead of cloudinary.uploader.upload_large():
 * cloudinary ^2.10.1's v2 adapter for upload_large is broken for multi-chunk files:
 * its Content-Range header uses a total of `-1` instead of `*`, so Cloudinary does
 * not enter chunked mode and rejects once the cumulative size passes the 100 MB
 * direct-upload cap ("File size too large. Got 125829120. Maximum is 104857600.").
 * This script implements the documented protocol directly:
 *   - X-Unique-Upload-Id groups all chunk requests.
 *   - Content-Range: "bytes <start>-<end>/*" until the final chunk, which carries
 *     the real total "bytes <start>-<end>/<size>".
 *   - Every request is multipart with signed params (api_key, timestamp, folder,
 *     x_unique_upload_id, signature) computed via cloudinary.utils.api_sign_request,
 *     and the raw chunk bytes as the "file" field. The file never transits a
 *     serverless function (bytes go straight to Cloudinary).
 *
 * Flow:
 *   1. chunked upload of the local video -> Cloudinary secure_url
 *   2. mint an admin JWT (same idiom as scripts/make-test-token.js)
 *   3. POST /api/posts { type: "sermon", title, body, mediaUrl, mediaType: "video" }
 *
 * The API stores the post, resolves the adaptive HLS manifest, audits POST_CREATE,
 * and pushes a "New Sermon" notification to every registered device.
 *
 * Usage (run from backend/ so backend/.env.local is loaded):
 *   node scripts/publish-large-sermon.js --check        # pre-flight, no side effects
 *   node scripts/publish-large-sermon.js --probe        # 120 MB multi-chunk upload test, then deletes it
 *   node scripts/publish-large-sermon.js "<video-path>" "<title>" "<body>"
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const cloudinary = require("cloudinary").v2;

// ── Load backend/.env.local manually (same parser as scripts/make-test-token.js) ──
const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}

const JWT_SECRET = process.env.JWT_SECRET;
const MONGODB_URI = process.env.MONGODB_URI;
const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;
const FOLDER = process.env.CLOUDINARY_UPLOAD_FOLDER || "church-member-app";
const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || "example@gmail.com";

// Default target: the locally-running backend (the deployed onrender host is a
// stub that itself points back at localhost:3000).
const DEFAULT_API_BASE = "http://localhost:3000/api";

const CHUNK_SIZE = 20 * 1024 * 1024; // 20 MB — Cloudinary allows 5–90 MB chunks

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

if (!JWT_SECRET) fail("JWT_SECRET is not set (check backend/.env.local)");
if (!MONGODB_URI) fail("MONGODB_URI is not set (check backend/.env.local)");
if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
  fail("CLOUDINARY_* is not set (check backend/.env.local)");
}

cloudinary.config({
  cloud_name: CLOUD_NAME,
  api_key: API_KEY,
  api_secret: API_SECRET,
  secure: true,
});

/**
 * Manual CHUNKED upload straight to Cloudinary (bypasses the 100 MB direct cap).
 * Streams one chunk at a time from disk (never holds the whole file in memory).
 * Resolves with the Cloudinary upload result (includes secure_url) once the final
 * chunk is acknowledged.
 */
async function uploadChunked(filePath, { folder, resourceType = "video" }) {
  const size = fs.statSync(filePath).size;
  const fd = fs.openSync(filePath, "r");
  const uploadId = crypto.randomUUID();
  const endpoint = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`;
  let result = null;

  try {
    let start = 0;
    while (start < size) {
      const len = Math.min(CHUNK_SIZE, size - start);
      const buffer = Buffer.alloc(len);
      fs.readSync(fd, buffer, 0, len, start);
      const end = start + len; // exclusive
      const isLast = end >= size;
      const contentRange = isLast
        ? `bytes ${start}-${end - 1}/${size}`
        : `bytes ${start}-${end - 1}/*`;

      const timestamp = Math.floor(Date.now() / 1000);
      // Cloudinary's signature check EXCLUDES x_unique_upload_id (see the
      // server's "String to sign - 'folder=...&timestamp=...'"), so only
      // folder + timestamp are signed. x_unique_upload_id is still sent (as a
      // form field + X-Unique-Upload-Id header) purely to group the chunks.
      const paramsToSign = {
        timestamp: String(timestamp),
        folder,
      };
      const signature = cloudinary.utils.api_sign_request(
        paramsToSign,
        API_SECRET,
      );

      const form = new FormData();
      form.append("api_key", API_KEY);
      form.append("timestamp", String(timestamp));
      form.append("folder", folder);
      form.append("x_unique_upload_id", uploadId);
      form.append("signature", signature);
      form.append("file", new Blob([buffer]), "chunk");

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Range": contentRange,
          "X-Unique-Upload-Id": uploadId,
        },
        body: form,
      });
      const json = await res.json().catch(() => ({}));
      if (json && json.error) {
        throw new Error(
          `Cloudinary rejected chunk ${start}-${end - 1}: ${
            (json.error && json.error.message) || JSON.stringify(json.error)
          }`,
        );
      }
      if (isLast) {
        result = json;
      } else if (!res.ok) {
        throw new Error(
          `Cloudinary returned HTTP ${res.status} for chunk ${start}-${end - 1}`,
        );
      }
      start = end;
    }
  } finally {
    fs.closeSync(fd);
  }

  if (!result || !result.secure_url) {
    throw new Error(
      `Chunked upload finished without a secure_url: ${JSON.stringify(result).slice(0, 300)}`,
    );
  }
  return result;
}

/** Finds an approved admin/staff user by email and mints a signed JWT for it. */
async function findAdminAndToken(email) {
  if (!email) fail("no admin email provided and SUPER_ADMIN_EMAIL unset");
  await mongoose.connect(MONGODB_URI);
  const User =
    mongoose.models.User ||
    mongoose.model("User", new mongoose.Schema({}, { strict: false }));
  const user = await User.findOne({ email: email.toLowerCase() }).select(
    "email fullName role status",
  );
  if (!user) fail(`no user found for email "${email}"`);
  if (!["admin", "staff"].includes(user.role)) {
    fail(
      `user "${email}" has role "${user.role}" — POST /api/posts needs admin/staff`,
    );
  }
  if (
    user.status &&
    user.status !== "approved" &&
    user.email.toLowerCase() !== SUPER_ADMIN_EMAIL.toLowerCase()
  ) {
    fail(
      `user "${email}" has status "${user.status}" (only the super-admin is exempt)`,
    );
  }
  const token = jwt.sign(
    {
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
      name: user.fullName,
    },
    JWT_SECRET,
    { expiresIn: "30d" },
  );
  return { token, user };
}

/** POSTs the post to the backend, mirroring the mobile create-post payload. */
async function createPost(apiBase, token, { title, body, mediaUrl }) {
  const res = await fetch(`${apiBase}/posts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      type: "sermon",
      title,
      body,
      mediaUrl,
      mediaType: "video",
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    fail(
      `POST ${apiBase}/posts -> HTTP ${res.status}: ${
        data?.error || JSON.stringify(data).slice(0, 400)
      }`,
    );
  }
  return data?.data;
}

async function preflight() {
  console.log("── Pre-flight check (no side effects) ──");
  console.log(`target API : ${DEFAULT_API_BASE}`);
  console.log(`admin email: ${SUPER_ADMIN_EMAIL}`);
  console.log(`cloud name : ${CLOUD_NAME}`);
  console.log(`folder     : ${FOLDER}`);

  try {
    const pong = await cloudinary.api.ping();
    console.log(`cloudinary : OK (${pong.status})`);
  } catch (err) {
    fail(`cloudinary ping failed: ${err.message}`);
  }

  const { user } = await findAdminAndToken(SUPER_ADMIN_EMAIL);
  console.log(`admin user : ${user.email} (role=${user.role})`);

  try {
    const res = await fetch(`${DEFAULT_API_BASE}/health`);
    const body = await res.json().catch(() => ({}));
    console.log(
      `backend    : HTTP ${res.status} mongo=${body?.mongo?.readyStateLabel ?? "unknown"}`,
    );
  } catch (err) {
    fail(`backend unreachable at ${DEFAULT_API_BASE}: ${err.message}`);
  }

  console.log("Pre-flight OK.");
}

/**
 * Upload-size probe. Size is configurable via env so we can find the account's
 * actual ceiling:
 *   VAGC_PROBE_MB=9        -> 9 MB, single chunk, under the observed 10 MB cap
 *   VAGC_PROBE_MB=120      -> 120 MB, multi-chunk, would trip a 100 MB direct cap
 * The uploaded asset is deleted afterwards.
 */
async function probeChunked() {
  const mb = Number(process.env.VAGC_PROBE_MB || 9);
  console.log(`── Probe: ${mb} MB VIDEO upload via the chunked uploader ──`);
  const tmp = path.join(os.tmpdir(), `vagc-probe-${Date.now()}.bin`);
  const fd = fs.openSync(tmp, "w");
  const block = crypto.randomBytes(1024 * 1024);
  for (let i = 0; i < mb; i++) fs.writeSync(fd, block);
  fs.closeSync(fd);
  console.log(`temp file : ${tmp} (${mb} MB)`);
  try {
    const started = Date.now();
    const up = await uploadChunked(tmp, {
      folder: FOLDER,
      resourceType: "video",
    });
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`✓ probe upload OK in ${secs}s`);
    console.log(`  public_id : ${up.public_id}`);
    console.log(
      `  bytes     : ${up.bytes} (${((up.bytes || 0) / 1024 / 1024).toFixed(1)} MB)`,
    );
    console.log(`  secure_url: ${up.secure_url}`);
    try {
      await cloudinary.api.delete_resources([up.public_id], {
        resource_type: "video",
      });
      console.log(`  cleaned up: deleted ${up.public_id}`);
    } catch (cleanErr) {
      console.log(
        `  (note: could not auto-delete probe asset: ${cleanErr.message})`,
      );
    }
    console.log(`Probe OK — ${mb} MB VIDEO upload accepted.`);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

async function publish(videoPath, title, body) {
  const absVideo = path.resolve(videoPath);
  if (!fs.existsSync(absVideo)) fail(`video not found: ${absVideo}`);
  const bytes = fs.statSync(absVideo).size;
  console.log(`video: ${absVideo}`);
  console.log(`size : ${(bytes / 1024 / 1024).toFixed(1)} MB`);
  console.log(`title: ${title}`);
  console.log(`admin: ${SUPER_ADMIN_EMAIL}`);
  console.log(`api  : ${DEFAULT_API_BASE}`);

  // 1. Chunked upload to Cloudinary (handles >100 MB).
  console.log(
    `→ uploading ${(bytes / 1024 / 1024).toFixed(1)} MB via chunked upload (${CHUNK_SIZE / 1024 / 1024} MB chunks)...`,
  );
  const started = Date.now();
  const up = await uploadChunked(absVideo, {
    folder: FOLDER,
    resourceType: "video",
  });
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  const mediaUrl = up.secure_url;
  console.log(`✓ uploaded in ${secs}s`);
  console.log(`  public_id : ${up.public_id}`);
  console.log(
    `  format    : ${up.format} (${((up.bytes || 0) / 1024 / 1024).toFixed(1)} MB)`,
  );
  console.log(`  secure_url: ${mediaUrl}`);

  // 2. Mint an admin JWT.
  const { token } = await findAdminAndToken(SUPER_ADMIN_EMAIL);

  // 3. Create the sermon post.
  console.log("→ creating sermon post via /api/posts...");
  const post = await createPost(DEFAULT_API_BASE, token, {
    title,
    body,
    mediaUrl,
  });
  console.log("✓ post created");
  console.log(`  post id   : ${post?._id}`);
  console.log(`  mediaUrl  : ${post?.mediaUrl}`);
  console.log(`  mediaType : ${post?.mediaType}`);
  console.log(
    "  push: New Sermon notification fanned out to registered devices (unless push failed)",
  );
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--check")) {
    await preflight();
  } else if (args.includes("--probe")) {
    await probeChunked();
  } else {
    if (args.length < 3) {
      fail(
        'usage: node scripts/publish-large-sermon.js --check | --probe | "<video-path>" "<title>" "<body>"',
      );
    }
    await publish(args[0], args[1], args[2]);
  }
  await mongoose.disconnect().catch(() => {});
  process.exit(0);
}

main().catch((err) => {
  console.error("FATAL:", err?.message || err);
  mongoose.disconnect().catch(() => {});
  process.exit(1);
});
