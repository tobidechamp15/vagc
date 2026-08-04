/* TEMPORARY end-to-end cron test (birthday status feature):
   1) inserts member A (valid email) + member B (invalid email) with DOB = today
   2) calls GET /api/cron/birthday-check with the CRON_SECRET
   3) verifies A -> birthdayStatus "sent", B -> birthdayStatus "failed"
   4) removes the test members + their logs so no data is left behind
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

const now = new Date();
const mm = String(now.getMonth() + 1).padStart(2, "0");
const dd = String(now.getDate()).padStart(2, "0");
const DOB = `2010-${mm}-${dd}`;

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { bufferCommands: false });
  const members = mongoose.connection.db.collection("members");
  const logs = mongoose.connection.db.collection("birthdayemaillogs");
  const marker = "E2EStatusTest";

  const mk = (fullName, gmail) => ({
    fullName,
    phoneNumber: "0000000000",
    address: "Temp",
    dateOfBirth: DOB,
    gmail,
    birthdaySent: false,
    birthdaySentDate: null,
    birthdaySentYear: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // 1) insert two test members
  const a = await members.insertOne(
    mk(`${marker} A`, "emmanuelomotunde52@gmail.com"),
  );
  const b = await members.insertOne(mk(`${marker} B`, "not-an-email"));
  console.log(
    `1) Inserted A=${a.insertedId} (valid email), B=${b.insertedId} (invalid email)`,
  );

  // 2) call the cron endpoint exactly like Vercel Cron would
  const cronRes = await fetch(`http://localhost:3000/api/cron/birthday-check`, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  const cronBody = await cronRes.json();
  console.log(`2) Cron HTTP ${cronRes.status}: checked=${cronBody.checked}`);
  console.log("   results:", JSON.stringify(cronBody.results));

  // 3) verify per-member status
  const aDoc = await members.findOne({ _id: a.insertedId });
  const bDoc = await members.findOne({ _id: b.insertedId });
  const logRows = await logs
    .find({ memberName: new RegExp("^" + marker) })
    .toArray();
  console.log(
    "3) A status:",
    JSON.stringify({
      birthdayStatus: aDoc.birthdayStatus,
      birthdayStatusYear: aDoc.birthdayStatusYear,
      birthdaySentYear: aDoc.birthdaySentYear,
      birthdaySent: aDoc.birthdaySent,
    }),
  );
  console.log(
    "   B status:",
    JSON.stringify({
      birthdayStatus: bDoc.birthdayStatus,
      birthdayStatusYear: bDoc.birthdayStatusYear,
      birthdaySentYear: bDoc.birthdaySentYear,
      birthdaySent: bDoc.birthdaySent,
    }),
  );
  console.log(
    "   Logs:",
    JSON.stringify(
      logRows.map((l) => ({
        member: l.memberName,
        status: l.status,
        errorMessage: l.errorMessage || null,
      })),
    ),
  );

  const ok =
    aDoc.birthdayStatus === "sent" &&
    aDoc.birthdayStatusYear === now.getFullYear() &&
    bDoc.birthdayStatus === "failed" &&
    bDoc.birthdayStatusYear === now.getFullYear();
  console.log(
    ok
      ? "RESULT: PASS — sent + failed statuses set correctly ✔"
      : "RESULT: FAIL ✘",
  );

  // 4) cleanup
  await members.deleteMany({ fullName: new RegExp("^" + marker) });
  await logs.deleteMany({ memberName: new RegExp("^" + marker) });
  console.log("4) Cleanup done.");

  await mongoose.disconnect();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("E2E test error:", e);
  process.exit(1);
});
