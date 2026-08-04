import { Schema, models, model } from "mongoose";

export type ActivityAction =
  | "LOGIN"
  | "MEMBER_CREATE"
  | "MEMBER_UPDATE"
  | "MEMBER_DELETE"
  | "NOTIFICATION_RESEND"
  | "ACCOUNT_APPROVE"
  | "ACCOUNT_REJECT";

export interface IActivityLog {
  _id?: string;
  actorId: string;
  actorName: string;
  actorEmail: string;
  actorRole: string;
  action: ActivityAction;
  targetId?: string;
  targetName?: string;
  // For MEMBER_UPDATE: { fieldName: { from, to } }
  changes?: Record<string, { from: unknown; to: unknown }>;
  // Extra context such as IP address / user agent
  meta?: Record<string, unknown>;
  timestamp: Date;
}

const ActivityLogSchema = new Schema<IActivityLog>(
  {
    actorId: { type: String, required: true },
    actorName: { type: String, required: true },
    actorEmail: { type: String, required: true },
    actorRole: { type: String, required: true },
    action: {
      type: String,
      enum: [
        "LOGIN",
        "MEMBER_CREATE",
        "MEMBER_UPDATE",
        "MEMBER_DELETE",
        "NOTIFICATION_RESEND",
        "ACCOUNT_APPROVE",
        "ACCOUNT_REJECT",
      ],
      required: true,
    },
    targetId: { type: String },
    targetName: { type: String },
    changes: { type: Schema.Types.Mixed },
    meta: { type: Schema.Types.Mixed },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

ActivityLogSchema.index({ action: 1, timestamp: -1 });
ActivityLogSchema.index({ actorId: 1, timestamp: -1 });
ActivityLogSchema.index({ targetId: 1, timestamp: -1 });
ActivityLogSchema.index({ timestamp: -1 });

export default models.ActivityLog ||
  model<IActivityLog>("ActivityLog", ActivityLogSchema);
