import { Schema, models, model, Types } from "mongoose";

export interface IEvent {
  _id?: string;
  title: string;
  description: string;
  location: string;
  startsAt: Date;
  endsAt?: Date | null;
  imageUrl?: string | null;
  createdBy: Types.ObjectId; // ref User
  rsvps: {
    deviceId?: string;
    memberId?: string;
    respondedAt: Date;
  }[];
  // Soft delete (revertible admin action): DELETE flips `deleted` to true
  // instead of removing the document, so an event can be brought back via
  // POST /api/events/:id/restore. `deletedAt`/`deletedBy` record who hid it.
  deleted: boolean;
  deletedAt?: Date | null;
  deletedBy?: Types.ObjectId | null; // ref User
  createdAt?: Date;
  updatedAt?: Date;
}

const EventSchema = new Schema<IEvent>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    location: { type: String, default: "" },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, default: null },
    // imageUrl comes from a direct-to-Cloudinary upload (DEV-18): the client
    // uploads the file straight to Cloudinary and passes back the returned
    // secure_url here, which the mobile app renders directly.
    imageUrl: { type: String, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    rsvps: {
      type: [
        {
          deviceId: { type: String },
          memberId: { type: String },
          respondedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    deleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

// Soft-deleted events are excluded from the public/admin list by default.
EventSchema.index({ deleted: 1, startsAt: 1 });

// Upcoming-events list is ordered by start time.
EventSchema.index({ startsAt: 1 });

// Supports the idempotent RSVP lookup ("does this device already exist?").
EventSchema.index({ "rsvps.deviceId": 1 });

export default models.Event || model<IEvent>("Event", EventSchema);
