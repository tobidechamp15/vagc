import { Schema, models, model } from "mongoose";

export interface IPrayerRequestReport {
  deviceId: string;
  // Optional reporter-supplied note shown to admins in the review queue.
  reason?: string;
  reportedAt: Date;
}

export interface IPrayerRequest {
  _id?: string;
  // Blank/omitted when submitted anonymously — the wall just omits the name.
  name?: string | null;
  message: string;
  // Denormalized count of "praying for this" taps, kept in sync with
  // `prayedBy` so the wall can render a count without aggregating.
  prayedForCount: number;
  // Admin moderation flag. Hidden requests drop out of the public wall query
  // but are NOT hard-deleted (matches the plan's moderation model).
  hidden: boolean;
  // DEV-29: the anonymous device that submitted this request. The wall is
  // public + allows anonymous names, so there is no user account to block —
  // content-moderation blocks are scoped to this device id instead (see
  // models/BlockedDevice.ts). Blank only for legacy rows written before DEV-29.
  deviceId?: string | null;
  // DEV-29: user-facing reporting. Any app user can report a request; the
  // reported count + reporter device ids flag it for admin review. Reporting
  // is idempotent per device (`reportedBy` holds which devices reported).
  reportedCount: number;
  reportedBy: IPrayerRequestReport[];
  // Which devices have prayed, for the idempotent "pray" tap (same pattern as
  // Event.rsvps). A repeat tap from the same device is a no-op.
  prayedBy: {
    deviceId: string;
    prayedAt: Date;
  }[];
  createdAt?: Date;
  updatedAt?: Date;
}

const PrayerRequestSchema = new Schema<IPrayerRequest>(
  {
    name: { type: String, trim: true, default: null },
    message: { type: String, required: true, trim: true },
    prayedForCount: { type: Number, default: 0 },
    hidden: { type: Boolean, default: false },
    deviceId: { type: String, default: null },
    reportedCount: { type: Number, default: 0 },
    reportedBy: {
      type: [
        {
          deviceId: { type: String },
          reason: { type: String, trim: true, maxlength: 500 },
          reportedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    prayedBy: {
      type: [
        {
          deviceId: { type: String },
          prayedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
);

// Public wall is ordered newest-first and only ever queries non-hidden rows.
PrayerRequestSchema.index({ hidden: 1, createdAt: -1 });
// Admin review: the dashboard filters reported requests for review.
PrayerRequestSchema.index({ reportedCount: -1, createdAt: -1 });
// Supports the idempotent "pray" lookup ("has this device already prayed?").
PrayerRequestSchema.index({ "prayedBy.deviceId": 1 });
// Supports "has this device already reported this request?" idempotency check.
PrayerRequestSchema.index({ "reportedBy.deviceId": 1 });

export default models.PrayerRequest ||
  model<IPrayerRequest>("PrayerRequest", PrayerRequestSchema);
