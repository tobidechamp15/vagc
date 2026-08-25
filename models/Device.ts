import { Schema, models, model } from "mongoose";

// ── Per-device push registration + notification preferences (DEV-26 ext.) ───
// Push notifications must work for EVERYONE who installs the app, not just
// signed-in staff accounts. A device registers anonymously with its stable
// deviceId (mobile/src/lib/deviceId.ts), and notification prefs live on the
// device so a logged-out visitor can still turn categories on/off.
//
// When a staff/admin account signs in on the device, the POST push-token route
// stamps `userId` so the account's own `notificationPrefs` keep governing that
// device too: a linked device only receives a category when BOTH its own pref
// AND the linked account's pref are ON (account-level is the master switch).
// Logging out clears the link, so a signed-out device falls back to device-only
// prefs.

export interface IDevicePrefs {
  masterPushEnabled: boolean;
  serviceReminders: boolean;
  eventInvitations: boolean;
  announcements: boolean;
  newsletter: boolean;
  paymentConfirmations: boolean;
  givingReminders: boolean;
  newMemberWelcomes: boolean;
  prayerRequests: boolean;
}

export interface IDevicePushToken {
  token: string; // "ExponentPushToken[...]" / "ExpoPushToken[...]"
  platform?: string; // "ios" | "android" | "web"
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IDevice {
  _id?: string;
  /** Stable anonymous device id (DEV-20). Unique per physical device. */
  deviceId: string;
  pushTokens?: IDevicePushToken[];
  notificationPrefs?: IDevicePrefs;
  /** Set when a staff/admin account signs in on this device; cleared on logout. */
  userId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const DevicePrefsSchema = new Schema<IDevicePrefs>(
  {
    masterPushEnabled: { type: Boolean, default: true },
    serviceReminders: { type: Boolean, default: true },
    eventInvitations: { type: Boolean, default: true },
    announcements: { type: Boolean, default: true },
    newsletter: { type: Boolean, default: false },
    paymentConfirmations: { type: Boolean, default: true },
    givingReminders: { type: Boolean, default: false },
    newMemberWelcomes: { type: Boolean, default: true },
    prayerRequests: { type: Boolean, default: true },
  },
  { _id: false },
);

const DevicePushTokenSchema = new Schema<IDevicePushToken>(
  {
    token: { type: String, required: true },
    platform: { type: String },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const DeviceSchema = new Schema<IDevice>(
  {
    deviceId: { type: String, required: true, unique: true, index: true },
    pushTokens: { type: [DevicePushTokenSchema], default: [] },
    notificationPrefs: { type: DevicePrefsSchema, default: () => ({}) },
    userId: { type: String, default: null },
  },
  { timestamps: true },
);

// Allow-list lookups (`{ userId: { $in: [...] } }`) in sendPushNotification.
DeviceSchema.index({ userId: 1 });

export default models.Device || model<IDevice>("Device", DeviceSchema);
