import { Schema, models, model } from "mongoose";

export type UserStatus = "pending" | "approved" | "rejected";

// ── Notification preferences (embedded sub-document) ─────────────────────────
export interface INotificationPrefs {
  masterPushEnabled: boolean;
  emailEnabled?: boolean;
  smsEnabled?: boolean;
  serviceReminders: boolean;
  eventInvitations: boolean;
  announcements: boolean;
  newsletter: boolean;
  paymentConfirmations: boolean;
  givingReminders: boolean;
  newMemberWelcomes: boolean;
  prayerRequests: boolean;
}

// ── User / Profile ───────────────────────────────────────────────────────────
export interface IUser {
  _id?: string;
  fullName: string;
  preferredName?: string;
  email: string;
  passwordHash: string;
  role: "admin" | "staff";
  status: UserStatus;
  resetToken?: string | null;
  resetTokenExpiry?: Date | null;

  // Profile fields (Fold §4.3)
  dateOfBirth?: string; // YYYY-MM-DD
  gender?: string;
  phoneNumber?: string;
  address?: string;
  maritalStatus?: string;
  avatarUrl?: string;

  // Membership facts (read-only, admin-set)
  memberSince?: string; // e.g. "March 2014"
  membershipId?: string; // e.g. "GA-004821"
  baptized?: boolean;
  baptizedDate?: string;

  // Church / organization
  churchName?: string;
  churchId?: string;
  departments?: string[];

  // Notification preferences (embedded)
  notificationPrefs?: INotificationPrefs;

  createdAt?: Date;
  updatedAt?: Date;
}

// ── Schema ───────────────────────────────────────────────────────────────────
const NotificationPrefsSchema = new Schema<INotificationPrefs>(
  {
    masterPushEnabled: { type: Boolean, default: true },
    emailEnabled: { type: Boolean, default: false },
    smsEnabled: { type: Boolean, default: false },
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

const UserSchema = new Schema<IUser>(
  {
    fullName: { type: String, required: true, trim: true },
    preferredName: { type: String, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Invalid email address"],
    },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["admin", "staff"], default: "admin" },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    resetToken: { type: String, default: null },
    resetTokenExpiry: { type: Date, default: null },

    // Profile
    dateOfBirth: { type: String },
    gender: { type: String },
    phoneNumber: { type: String },
    address: { type: String },
    maritalStatus: { type: String },
    avatarUrl: { type: String },

    // Membership
    memberSince: { type: String },
    membershipId: { type: String },
    baptized: { type: Boolean },
    baptizedDate: { type: String },

    // Church
    churchName: { type: String },
    churchId: { type: String },
    departments: [{ type: String }],

    // Notifications
    notificationPrefs: { type: NotificationPrefsSchema, default: () => ({}) },
  },
  { timestamps: true },
);

export default models.User || model<IUser>("User", UserSchema);
