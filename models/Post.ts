import { Schema, models, model, Types } from "mongoose";

export type PostType = "announcement" | "pastors_message" | "sermon";

export interface IPost {
  _id?: string;
  type: PostType;
  title: string;
  body: string;
  imageUrl?: string | null;
  mediaUrl?: string | null;
  mediaType?: "audio" | "video" | null;
  authorId: Types.ObjectId; // ref User
  publishedAt: Date;
  // DEV-23: reaction count + which devices reacted, for the idempotent "Amen"
  // tap (same device-idempotent pattern as Event.rsvps / the prayer-request
  // prayedBy). `reactionCount` stays as the denormalized count for display;
  // `reactedBy` drives the per-device "already tapped" check.
  reactionCount: number;
  reactedBy: {
    deviceId: string;
    reactedAt: Date;
  }[];
  // Soft delete (revertible admin action): DELETE flips `deleted` to true
  // instead of removing the document, so a post can be brought back via
  // POST /api/posts/:id/restore. `deletedAt`/`deletedBy` record who hid it.
  deleted: boolean;
  deletedAt?: Date | null;
  deletedBy?: Types.ObjectId | null; // ref User
  createdAt?: Date;
  updatedAt?: Date;
}

const PostSchema = new Schema<IPost>(
  {
    type: {
      type: String,
      enum: ["announcement", "pastors_message", "sermon"],
      required: true,
    },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true },
    imageUrl: { type: String, default: null },
    mediaUrl: { type: String, default: null },
    mediaType: { type: String, enum: ["audio", "video"], default: null },
    authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    publishedAt: { type: Date, required: true, default: Date.now },
    reactionCount: { type: Number, default: 0 },
    reactedBy: {
      type: [
        {
          deviceId: { type: String },
          reactedAt: { type: Date, default: Date.now },
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

// Soft-deleted posts are excluded from the public/admin feed by default.
PostSchema.index({ deleted: 1, publishedAt: -1 });

// Feed is ordered newest-first by publish time.
PostSchema.index({ publishedAt: -1 });
// Supports the idempotent "react" lookup ("has this device already reacted?").
PostSchema.index({ "reactedBy.deviceId": 1 });

export default models.Post || model<IPost>("Post", PostSchema);
