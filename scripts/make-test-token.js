/**
 * Mint a signed JWT for a given account with an arbitrary role claim.
 *
 * Used by QA / the endpoint test suite to prove role-based access control:
 * e.g. a VALID token (correct user, signed with the real JWT_SECRET) whose
 * `role` claim is NOT a writer role (admin/staff) must still be rejected with
 * 403 by POST /api/posts — it must not be accepted just because it's a valid
 * token (Linear test case #13: "valid token but non-admin role -> 403").
 *
 * The token references a real, existing user (must exist in Mongo, since
 * requireApprovedUser() looks the user up by id and checks their status), so
 * this is NOT a forged token — it's the same token the user would receive at
 * login, with the role claim overridden to simulate a non-writer account.
 *
 * Usage:
 *   node scripts/make-test-token.js <email> [role]
 *
 * Examples:
 *   node scripts/make-test-token.js approved@example.com member
 *   node scripts/make-test-token.js approved@example.com visitor
 *
 * Prints the token to stdout. Pass it to the endpoint tests as:
 *   BASE_URL=... NON_ADMIN_TOKEN=$(node scripts/make-test-token.js <email> member) \
 *   node ../artifacts/backend-endpoint-tests.mjs
 *
 * NOTE: the User model enum only allows admin/staff, so to mint a token whose
 * role claim is non-writer you override ONLY the JWT claim — the DB role is
 * left untouched. This is intentional: the endpoint authorizes on the role
 * claim carried by the token (requireApprovedUser() returns the token payload),
 * so a token with a non-writer role must be rejected even for an approved user.
 */
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
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

const JWT_SECRET = process.env.JWT_SECRET;
const MONGODB_URI = process.env.MONGODB_URI;
const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || "example@gmail.com";

// Mirrors lib/auth.ts — the super-admin email is exempt from status checks.
const isSuperAdminEmail = (email) =>
  email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();

if (!JWT_SECRET) {
  console.error("ERROR: JWT_SECRET is not set (check .env.local)");
  process.exit(1);
}
if (!MONGODB_URI) {
  console.error("ERROR: MONGODB_URI is not set (check .env.local)");
  process.exit(1);
}

const email = process.argv[2];
const role = process.argv[3] || "member";

if (!email) {
  console.error(
    "ERROR: pass the account email, e.g. node scripts/make-test-token.js admin@example.com member",
  );
  process.exit(1);
}

async function main() {
  await mongoose.connect(MONGODB_URI);

  const User =
    mongoose.models.User ||
    mongoose.model("User", new mongoose.Schema({}, { strict: false }));
  const user = await User.findOne({ email: email.toLowerCase() }).select(
    "email fullName role status",
  );

  if (!user) {
    console.error(`ERROR: no user found for email "${email}"`);
    await mongoose.disconnect();
    process.exit(1);
  }
  if (
    user.status &&
    user.status !== "approved" &&
    !isSuperAdminEmail(user.email)
  ) {
    console.error(
      `ERROR: user "${email}" has status "${user.status}" — requireApprovedUser() blocks non-approved accounts before the role check (401/403 pending gate). Use an approved account.`,
    );
    await mongoose.disconnect();
    process.exit(1);
  }

  const payload = {
    userId: user._id.toString(),
    email: user.email,
    role, // overridden role claim — the whole point of this script
    name: user.fullName,
  };

  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });

  console.log(token);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Error minting token:", err);
  process.exit(1);
});
