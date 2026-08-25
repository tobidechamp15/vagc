import { connectDB } from "@/lib/mongodb";
import BlockedDevice from "@/models/BlockedDevice";

/**
 * DEV-29: device-level content moderation for the public prayer wall.
 *
 * The wall has no login and submissions can be anonymous, so there is no user
 * account to block. Blocks are scoped to the anonymous device identifier every
 * public action sends (mobile: src/lib/deviceId.ts) — see the decision record in
 * privacy/ugc-reporting-blocking.md. A blocked device is rejected (403) from
 * the public write endpoints (submit / report / pray).
 */

/** True when the device is currently blocked from public wall actions. */
export async function isDeviceBlocked(deviceId: string): Promise<boolean> {
  if (!deviceId) return false;
  try {
    await connectDB();
    return (await BlockedDevice.exists({ deviceId })) !== null;
  } catch (err) {
    // Never fail the main request because a block lookup errored.
    console.error("Failed to check device block:", err);
    return false;
  }
}

export interface BlockInput {
  deviceId: string;
  reason?: string;
  blockedBy?: string;
}

/** Creates (idempotently) a block record for a device. */
export async function blockDevice(input: BlockInput) {
  await connectDB();
  return BlockedDevice.findOneAndUpdate(
    { deviceId: input.deviceId },
    {
      $setOnInsert: {
        reason: input.reason,
        blockedBy: input.blockedBy,
        blockedAt: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

/** Removes a device block. Returns true when a block existed and was removed. */
export async function unblockDevice(deviceId: string): Promise<boolean> {
  await connectDB();
  const res = await BlockedDevice.deleteOne({ deviceId });
  return res.deletedCount > 0;
}
