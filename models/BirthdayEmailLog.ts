import { Schema, models, model } from "mongoose";

export interface IBirthdayEmailLog {
  memberId: string;
  memberName: string;
  email: string;
  sentDate: Date;
  status: "sent" | "failed";
  errorMessage?: string;
}

const BirthdayEmailLogSchema = new Schema<IBirthdayEmailLog>({
  memberId: { type: String, required: true },
  memberName: { type: String, required: true },
  email: { type: String, required: true },
  sentDate: { type: Date, default: Date.now },
  status: { type: String, enum: ["sent", "failed"], required: true },
  errorMessage: { type: String },
});

export default models.BirthdayEmailLog ||
  model<IBirthdayEmailLog>("BirthdayEmailLog", BirthdayEmailLogSchema);
