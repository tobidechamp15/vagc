import { Schema, models, model } from "mongoose";

// DEV-30: fixed-window rate-limit counter.
//
// One document per (route, identifier, window-start). The document is bumped
// atomically with $inc, so concurrent requests from the same caller still only
// consume the right number of "slots". A TTL index on `expiresAt` lets MongoDB
// delete old buckets automatically, so the collection never grows unbounded.
//
// Storing these in MongoDB (rather than in-memory or an external Redis/Upstash)
// is intentional: Vercel serverless functions are ephemeral and horizontally
// scaled, so per-instance memory would be bypassable and inconsistent. MongoDB
// is already the datastore, so this adds no new infrastructure.
export interface IRateLimit {
  _id?: string;
  /** Unique bucket key, e.g. `auth.login:ip-1.2.3.4:1692500000000`. */
  key: string;
  /** Number of requests already counted in this window. */
  count: number;
  /** When this bucket expires and is auto-deleted by the TTL index. */
  expiresAt: Date;
}

const RateLimitSchema = new Schema<IRateLimit>(
  {
    key: { type: String, required: true, unique: true },
    count: { type: Number, required: true, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// Auto-expire old buckets as soon as their window ends.
RateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// Lookups are always by exact key (findOneAndUpdate), so the unique index
// already covers the query path.

export default models.RateLimit ||
  model<IRateLimit>("RateLimit", RateLimitSchema);
