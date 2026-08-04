import { NextRequest } from "next/server";
import ActivityLog, { ActivityAction } from "@/models/ActivityLog";
import { connectDB } from "@/lib/mongodb";
import { TokenPayload } from "@/lib/auth";

export interface ActivityInput {
  actor: TokenPayload;
  action: ActivityAction;
  targetId?: string;
  targetName?: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
  meta?: Record<string, unknown>;
}

/**
 * Best-effort audit logging. Never throws — a failure to write the log must
 * not break the main request (member create/update, login, resend, ...).
 */
export async function logActivity(input: ActivityInput) {
  try {
    await connectDB();
    await ActivityLog.create({
      actorId: input.actor.userId,
      actorName: input.actor.name || input.actor.email,
      actorEmail: input.actor.email,
      actorRole: input.actor.role,
      action: input.action,
      targetId: input.targetId,
      targetName: input.targetName,
      changes: input.changes,
      meta: input.meta,
      timestamp: new Date(),
    });
  } catch (err) {
    console.error("Failed to write activity log:", err);
  }
}

/** Extract IP + user-agent from an incoming request for audit context. */
export function getRequestMeta(req: NextRequest): Record<string, unknown> {
  return {
    ip:
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown",
    userAgent: req.headers.get("user-agent") || "unknown",
  };
}

/** Compute field-level differences between a member before and after an update. */
export function diffFields(
  before: Record<string, any>,
  after: Record<string, any>,
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(after)) {
    if (before[key] === undefined) continue;
    if (String(before[key]) !== String(after[key])) {
      changes[key] = { from: before[key], to: after[key] };
    }
  }
  return changes;
}

export interface ActivityQuery {
  action?: string;
  actorId?: string;
  q?: string; // free-text search on actorName / targetName
  from?: string; // ISO date
  to?: string; // ISO date
  page?: number;
  limit?: number;
}

export interface ActivityLogItem {
  _id: string;
  actorName: string;
  actorEmail: string;
  actorRole: string;
  action: ActivityAction;
  targetId?: string;
  targetName?: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
  meta?: Record<string, unknown>;
  timestamp: string;
}

export interface ActivityQueryResult {
  items: ActivityLogItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Shared filter/pagination used by both the /api/activity route and the dashboard. */
export async function queryActivityLogs(
  query: ActivityQuery,
): Promise<ActivityQueryResult> {
  await connectDB();

  const filter: Record<string, unknown> = {};
  if (query.action) filter.action = query.action;
  if (query.actorId) filter.actorId = query.actorId;
  if (query.q) {
    filter.$or = [
      { actorName: { $regex: query.q, $options: "i" } },
      { targetName: { $regex: query.q, $options: "i" } },
    ];
  }
  if (query.from || query.to) {
    const ts: Record<string, Date> = {};
    if (query.from) ts.$gte = new Date(query.from);
    if (query.to) ts.$lte = new Date(query.to);
    filter.timestamp = ts;
  }

  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(100, Math.max(1, query.limit ?? 50));
  const skip = (page - 1) * limit;

  const [docs, total] = await Promise.all([
    ActivityLog.find(filter)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ActivityLog.countDocuments(filter),
  ]);

  const items: ActivityLogItem[] = docs.map((d: any) => ({
    _id: d._id.toString(),
    actorName: d.actorName,
    actorEmail: d.actorEmail,
    actorRole: d.actorRole,
    action: d.action,
    targetId: d.targetId,
    targetName: d.targetName,
    changes: d.changes,
    meta: d.meta,
    timestamp: new Date(d.timestamp).toISOString(),
  }));

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

/** Simple counts grouped by action, used for the dashboard summary. */
export async function getActivityStats() {
  await connectDB();
  const rows = await ActivityLog.aggregate<{ _id: string; count: number }>([
    { $group: { _id: "$action", count: { $sum: 1 } } },
  ]);
  const byAction: Record<string, number> = {};
  let total = 0;
  for (const row of rows) {
    byAction[row._id] = row.count;
    total += row.count;
  }
  return { total, byAction };
}
