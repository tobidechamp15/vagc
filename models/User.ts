import { Schema, models, model } from "mongoose";

export interface IUser {
  _id?: string;
  fullName: string;
  email: string;
  passwordHash: string;
  role: "admin" | "staff";
  resetToken?: string | null;
  resetTokenExpiry?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const UserSchema = new Schema<IUser>(
  {
    fullName: { type: String, required: true, trim: true },
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
    resetToken: { type: String, default: null },
    resetTokenExpiry: { type: Date, default: null },
  },
  { timestamps: true }
);

export default models.User || model<IUser>("User", UserSchema);
