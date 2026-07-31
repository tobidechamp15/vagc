import { Schema, models, model } from "mongoose";

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
  },
  { timestamps: true }
);

MemberSchema.index({ fullName: "text", gmail: "text", phoneNumber: "text" });

export default models.Member || model<IMember>("Member", MemberSchema);
