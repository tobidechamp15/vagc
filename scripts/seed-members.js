/**
 * Seed script: inserts N realistic members into the database.
 *
 * Usage:
 *   node scripts/seed-members.js [count]
 *
 * Example:
 *   node scripts/seed-members.js 300
 *
 * It connects to the same MONGODB_URI from .env.local and inserts batch-by-batch
 * so it works on free-tier Atlas without overwhelming the connection.
 */
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

// ── Load .env.local manually (same approach as scripts/e2e-cron-test.js) ──
const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}

// ── Deterministic PRNG so re-runs produce the same data ──
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260808);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const rint = (min, max) => Math.floor(rand() * (max - min + 1)) + min;

// ── Sample data pools ──
const FIRST_NAMES = [
  "Ade",
  "Bola",
  "Chinedu",
  "Chiamaka",
  "Damilare",
  "Efe",
  "Funke",
  "Grace",
  "Hakeem",
  "Ifeoma",
  "Joseph",
  "Kehinde",
  "Lola",
  "Muyiwa",
  "Ngozi",
  "Obinna",
  "Oluwaseun",
  "Oyindamola",
  "Peter",
  "Queen",
  "Rashidat",
  "Seyi",
  "Tunde",
  "Uche",
  "Victor",
  "Wale",
  "Yemi",
  "Zainab",
  "Adaeze",
  "Bamidele",
  "Chuka",
  "Deborah",
  "Emeka",
  "Favour",
  "Gideon",
  "Hauwa",
  "Ikenna",
  "Jumoke",
  "Kemi",
  "Lanre",
  "Mary",
  "Nnamdi",
  "Olamide",
  "Priscilla",
  "Rotimi",
  "Simi",
  "Tobi",
  "Ugochi",
  "Vivian",
  "Ayomide",
  "Bukunmi",
  "Chisom",
  "David",
  "Esther",
];

const LAST_NAMES = [
  "Adeyemi",
  "Bello",
  "Chukwu",
  "Okafor",
  "Balogun",
  "Eze",
  "Ogunleye",
  "Nwachukwu",
  "Afolabi",
  "Ibrahim",
  "Okonkwo",
  "Adeleke",
  "Olawale",
  "Umeh",
  "Adeyinka",
  "Mohammed",
  "Ezeike",
  "Akinwale",
  "Obi",
  "Adegbite",
  "Nwosu",
  "Oyelaran",
  "Abubakar",
  "Okoro",
  "Adeoti",
  "Iheanacho",
  "Bakare",
  "Onyeka",
  "Fashola",
  "Adepoju",
  "Chime",
  "Olawumi",
  "Ekwueme",
  "Adewale",
  "Ngige",
  "Ogundipe",
  "Amadi",
  "Adejare",
  "Osinachi",
  "Adeosun",
  "Emenike",
  "Alabi",
  "Okeke",
  "Adigun",
  "Nwankwo",
  "Ojo",
  "Ajayi",
  "Ilori",
  "Salami",
  "Oyelade",
];

const CITIES = [
  "Lagos",
  "Ibadan",
  "Abuja",
  "Port Harcourt",
  "Enugu",
  "Abeokuta",
];

const STREETS = [
  "Broad Street",
  "Admiralty Way",
  "Awolowo Road",
  "Adeniran Ogunsanya",
  "Bode Thomas",
  "Ahmadu Bello Way",
  "Isaac John",
  "Fola Osibo",
  "Toyin Street",
  "Opebi Road",
  "Allen Avenue",
  "Kofo Abayomi",
  "Ozumba Mbadiwe",
  "Marina Road",
  "Murtala Mohammed Way",
  "Abakaliki Road",
  "Aguiyi Ironsi Street",
  "Gana Street",
  "Saka Tinubu",
  "Ikorodu Road",
];

// ── Generators ──
function randomDateOfBirth() {
  const year = rint(1960, 2010);
  const month = rint(1, 12);
  const day = rint(1, 28); // 28 keeps every month valid
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function randomPhoneNumber() {
  const digits = Array.from({ length: 10 }, () => rint(0, 9)).join("");
  return `+234${digits}`;
}

function randomAddress() {
  return `${rint(1, 120)} ${pick(STREETS)}, ${pick(CITIES)}`;
}

function makeMember(i) {
  const first = pick(FIRST_NAMES);
  const last = pick(LAST_NAMES);
  const fullName = `${first} ${last}`;
  const gmail = `${first}.${last}${i}@gmail.com`.toLowerCase();
  const now = new Date();
  return {
    fullName,
    phoneNumber: randomPhoneNumber(),
    address: randomAddress(),
    dateOfBirth: randomDateOfBirth(),
    gmail,
    birthdaySent: false,
    birthdaySentDate: null,
    birthdaySentYear: null,
    birthdayStatus: "pending",
    birthdayStatusYear: null,
    birthdayRetryCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

async function main() {
  const count = Math.max(1, parseInt(process.argv[2] || "300", 10) || 300);

  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI not found — check backend/.env.local");
    process.exit(1);
  }

  console.log(`Connecting to MongoDB…`);
  await mongoose.connect(process.env.MONGODB_URI, { bufferCommands: false });
  const collection = mongoose.connection.db.collection("members");

  const before = await collection.countDocuments();
  console.log(`Members before seeding: ${before}`);

  // Build all records first so we can report the unique email range up front.
  const records = Array.from({ length: count }, (_, i) => makeMember(i + 1));

  // Insert in small batches to stay under Atlas write limits.
  const BATCH = 50;
  let inserted = 0;
  for (let start = 0; start < records.length; start += BATCH) {
    const chunk = records.slice(start, start + BATCH);
    const res = await collection.insertMany(chunk, { ordered: true });
    inserted += res.insertedCount;
    console.log(`  inserted ${res.insertedCount} (${inserted}/${count})`);
  }

  const after = await collection.countDocuments();
  console.log(`\nDone. Inserted ${inserted} members.`);
  console.log(`Members total now: ${after}`);
  console.log(
    `Sample: ${records[0].fullName} <${records[0].gmail}> — DOB ${records[0].dateOfBirth}`,
  );

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error("Seed error:", e);
  process.exit(1);
});
