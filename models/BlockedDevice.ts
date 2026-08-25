import { Schema, models, model } from "mongoose";

/**
 * DEV-29: device-level content-moderation block.
 *
 * The public prayer wall has no login and submissions may be fully anonymous,
 * so "block a user" cannot target a user account (see the resolution recorded
 * in privacy/ugc-reporting-blocking.md). Instead, moderation blocks target the
 * same anonymous device identifier every public action already sends
 * (src/lib/deviceId.ts on mobile). A blocked device cannot submit, report, or
 * pray on the wall.
 */
export interface IBlockedDevice {
  _id?: string;
  /** The anonymous device identifier being blocked (unique). */
  deviceId: string;
  /** Why it was blocked, e.g. "repeatedly posted inappropriate content". */
  reason?: string;
  /** Which admin/staff issued the block (email). */
  blockedBy?: string;
  blockedAt?: Date;
}

const BlockedDeviceSchema = new Schema<IBlockedDevice>(
  {
    deviceId: { type: String, required: true, unique: true },
    reason: { type: String, trim: true },
    blockedBy: { type: String, trim: true },
    blockedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

export default models.BlockedDevice ||
  model<IBlockedDevice>("BlockedDevice", BlockedDeviceSchema);
