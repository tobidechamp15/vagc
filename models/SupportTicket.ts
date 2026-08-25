import { Schema, models, model } from "mongoose";

export type SupportTicketStatus = "open" | "in_progress" | "resolved";

export interface ISupportTicket {
  _id?: string;
  // The submitting client. The app is anonymous-first, so most tickets come
  // from a deviceId; a logged-in admin/staff account (unlikely but possible)
  // can attach userId instead.
  deviceId?: string | null;
  userId?: string | null;
  subject: string;
  message: string;
  // Which screen/feature it was about (sent by the client, optional).
  screenContext?: string | null;
  status: SupportTicketStatus;
  adminResponse?: string | null;
  resolvedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const SupportTicketSchema = new Schema<ISupportTicket>(
  {
    deviceId: { type: String, default: null },
    userId: { type: String, default: null },
    subject: { type: String, required: true, trim: true, maxlength: 200 },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    screenContext: { type: String, default: null, maxlength: 200 },
    status: {
      type: String,
      enum: ["open", "in_progress", "resolved"],
      default: "open",
    },
    adminResponse: { type: String, default: null, maxlength: 2000 },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Admin triage list is filtered by status and ordered newest-first.
SupportTicketSchema.index({ status: 1, createdAt: -1 });
// Lets "my tickets" style lookups by device be cheap if added later.
SupportTicketSchema.index({ deviceId: 1, createdAt: -1 });

export default models.SupportTicket ||
  model<ISupportTicket>("SupportTicket", SupportTicketSchema);
