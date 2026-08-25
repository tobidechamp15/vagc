import { Schema, models, model } from "mongoose";
import { daysUntilNextBirthday } from "@/lib/birthdaySort";

export interface IMember {
  _id?: string;
  fullName: string;
  phoneNumber: string;
  address: string;
  dateOfBirth: string; // YYYY-MM-DD
  gmail: string;
  createdAt?: Date;
  updatedAt?: Date;
  birthdaySent: boolean;
  birthdaySentDate?: Date | null;
  birthdaySentYear?: number | null; // which year we last sent for, so it resets annually
  birthdayStatus: "pending" | "sent" | "failed"; // current-year birthday email status
  birthdayStatusYear?: number | null; // the year birthdayStatus refers to (rolls over on Jan 1)
  birthdayRetryCount?: number; // how many auto send attempts failed this year (cron retry cap)
  nextBirthdayOrdinal?: number; // days until next birthday (0–365), for indexed directory sort
}

const MemberSchema = new Schema<IMember>(
  {
    fullName: { type: String, required: true, trim: true },
    phoneNumber: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    dateOfBirth: { type: String, required: true }, // stored as YYYY-MM-DD
    gmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Invalid email address"],
    },
    birthdaySent: { type: Boolean, default: false },
    birthdaySentDate: { type: Date, default: null },
    birthdaySentYear: { type: Number, default: null },
    birthdayStatus: {
      type: String,
      enum: ["pending", "sent", "failed"],
      default: "pending",
    },
    birthdayStatusYear: { type: Number, default: null },
    birthdayRetryCount: { type: Number, default: 0 },
    // Days until the member's next birthday (0–365; 3650 sentinel for a missing/
    // invalid dateOfBirth, which sorts last like the old in-memory sort did).
    // Recomputed on save when dateOfBirth is set/changed, and for ALL members by
    // the daily cron refresh in /api/cron/birthday-check (the value decays at
    // midnight, so a stored ordinal would otherwise go stale and reorder the
    // directory).
    nextBirthdayOrdinal: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// Keeps the ordinal in sync when a member is created via `.create()`/`.save()`
// (e.g. POST /api/members). Only recomputed when dateOfBirth actually changed.
MemberSchema.pre("save", function (next) {
  if (this.isNew || this.isModified("dateOfBirth")) {
    this.nextBirthdayOrdinal = daysUntilNextBirthday(this.dateOfBirth);
  }
  next();
});

// PUT /api/members updates via `findByIdAndUpdate`, which bypasses document
// middleware (pre("save")). Query middleware fills in the ordinal whenever the
// update carries a new dateOfBirth so edits stay correct without the cron.
MemberSchema.pre("findOneAndUpdate", function () {
  const update: any = this.getUpdate() || {};
  const set = update.$set || {};
  // Reads dateOfBirth from either the `{ $set: { dateOfBirth } }` form the PUT
  // route uses, or a flat `{ dateOfBirth }` update — the common place a naive
  // `update.$set.dateOfBirth` silently no-ops.
  const dob =
    typeof set.dateOfBirth === "string" ? set.dateOfBirth : update.dateOfBirth;
  if (typeof dob === "string") {
    this.setUpdate({
      ...update,
      $set: { ...set, nextBirthdayOrdinal: daysUntilNextBirthday(dob) },
    });
  }
});

// Indexed sort for the member directory: ascending ordinal = closest upcoming
// birthday first. `_id` tiebreaker keeps skip/limit pagination stable across
// pages when several members share the same birthday (same ordinal).
MemberSchema.index({ nextBirthdayOrdinal: 1, _id: 1 });
MemberSchema.index({ fullName: "text", gmail: "text", phoneNumber: "text" });

export default models.Member || model<IMember>("Member", MemberSchema);
