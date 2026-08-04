/* TEMPORARY end-to-end test for POST /api/members/:id/resend-birthday.
   Registers a throwaway user, creates two test members with DOB = today,
   verifies: success path, already-sent guard, failure path, then cleans up.
*/
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

// Load .env.local manually
const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}

const BASE = "http://localhost:3000";
const marker = "ResendTest";
const now = new Date();
const mm = String(now.getMonth() + 1).padStart(2, "0");
const dd = String(now.getDate()).padStart(2, "0");
const DOB = `2010-${mm}-${dd}`;
const year = now.getFullYear();

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { bufferCommands: false });
  const db = mongoose.connection.db;
  const members = db.collection("members");
  const logs = db.collection("birthdayemaillogs");
  const users = db.collection("users");

  // 1) register a throwaway admin user to get a JWT
  const email = `${marker}${Date.now()}@test.com`;
  const regRes = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fullName: "Resend Test User",
      email,
      password: "test1234",
    }),
  });
  const regBody = await regRes.json();
  const token = regBody.data?.token;
  if (!token) {
    console.log(
      "FAIL — could not register test user:",
      JSON.stringify(regBody),
    );
    process.exit(1);
  }
  const auth = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  console.log("1) Registered test user, got JWT.");

  const mk = (fullName, gmail) => ({
    fullName,
    phoneNumber: "0000000000",
    address: "Temp",
    dateOfBirth: DOB,
    gmail,
    birthdaySent: false,
    birthdaySentDate: null,
    birthdaySentYear: null,
    birthdayStatus: "failed", // simulate a failed attempt earlier today
    birthdayStatusYear: year,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const good = await members.insertOne(
    mk(`${marker} Good`, "emmanuelomotunde52@gmail.com"),
  );
  const bad = await members.insertOne(mk(`${marker} Bad`, "not-an-email"));

  // 2) success path
  const r1 = await fetch(
    `${BASE}/api/members/${good.insertedId}/resend-birthday`,
    {
      method: "POST",
      headers: auth,
    },
  );
  const b1 = await r1.json();
  const gAfter = await members.findOne({ _id: good.insertedId });
  console.log(
    `2) Resend (valid email) -> HTTP ${r1.status}, sent=${b1.success}`,
  );
  console.log(
    `   Member now: ${JSON.stringify({ status: gAfter.birthdayStatus, sent: gAfter.birthdaySent, sentYear: gAfter.birthdaySentYear })}`,
  );

  // 3) already-sent guard
  const r2 = await fetch(
    `${BASE}/api/members/${good.insertedId}/resend-birthday`,
    {
      method: "POST",
      headers: auth,
    },
  );
  const b2 = await r2.json();
  console.log(
    `3) Second resend -> HTTP ${r2.status} (expect 400), error="${b2.error}"`,
  );

  // 4) failure path
  const r3 = await fetch(
    `${BASE}/api/members/${bad.insertedId}/resend-birthday`,
    {
      method: "POST",
      headers: auth,
    },
  );
  const b3 = await r3.json();
  const bAfter = await members.findOne({ _id: bad.insertedId });
  console.log(
    `4) Resend (invalid email) -> HTTP ${r3.status}, sent=${b3.success}`,
  );
  console.log(
    `   Member now: ${JSON.stringify({ status: bAfter.birthdayStatus, sent: bAfter.birthdaySent })}`,
  );

  const ok =
    r1.status === 200 &&
    b1.success &&
    gAfter.birthdayStatus === "sent" &&
    gAfter.birthdaySent === true &&
    r2.status === 400 &&
    !b2.success &&
    r3.status === 500 &&
    !b3.success &&
    bAfter.birthdayStatus === "failed";
  console.log(ok ? "RESULT: PASS ✔" : "RESULT: FAIL ✘");

  // 5) cleanup
  await users.deleteMany({ email });
  await members.deleteMany({ fullName: new RegExp("^" + marker) });
  await logs.deleteMany({ memberName: new RegExp("^" + marker) });
  console.log("5) Cleanup done.");

  await mongoose.disconnect();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("Test error:", e);
  process.exit(1);
});
