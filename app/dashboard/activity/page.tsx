import { queryActivityLogs, getActivityStats } from "@/lib/activity";
import type { ActivityLogItem } from "@/lib/activity";
import type { ActivityAction } from "@/models/ActivityLog";
import ChangesList from "./ChangesList";

export const dynamic = "force-dynamic";

const ACTION_LABELS: Record<ActivityAction, string> = {
  LOGIN: "Login",
  MEMBER_CREATE: "Member added",
  MEMBER_UPDATE: "Member edited",
  MEMBER_DELETE: "Member deleted",
  NOTIFICATION_RESEND: "Notification resent",
  ACCOUNT_APPROVE: "Account approved",
  ACCOUNT_REJECT: "Account rejected",
  POST_CREATE: "Post created",
  POST_UPDATE: "Post edited",
  POST_DELETE: "Post deleted",
  POST_RESTORE: "Post restored",
  EVENT_CREATE: "Event created",
  EVENT_UPDATE: "Event edited",
  EVENT_DELETE: "Event deleted",
  EVENT_RESTORE: "Event restored",
  PRAYER_HIDE: "Prayer request hidden",
  PRAYER_UNHIDE: "Prayer request unhidden",
  PRAYER_DELETE: "Prayer request deleted",
  PRAYER_BLOCK_DEVICE: "Device blocked from prayer wall",
  PRAYER_UNBLOCK_DEVICE: "Device unblocked from prayer wall",
  PRAYER_CLEAR_REPORTS: "Prayer request reports cleared",
  SUPPORT_TICKET_UPDATE: "Support ticket updated",
};

const ACTIONS: ActivityAction[] = [
  "LOGIN",
  "MEMBER_CREATE",
  "MEMBER_UPDATE",
  "MEMBER_DELETE",
  "NOTIFICATION_RESEND",
  "ACCOUNT_APPROVE",
  "ACCOUNT_REJECT",
  "POST_CREATE",
  "POST_UPDATE",
  "POST_DELETE",
  "POST_RESTORE",
  "EVENT_CREATE",
  "EVENT_UPDATE",
  "EVENT_DELETE",
  "EVENT_RESTORE",
  "PRAYER_HIDE",
  "PRAYER_UNHIDE",
  "PRAYER_DELETE",
  "PRAYER_BLOCK_DEVICE",
  "PRAYER_UNBLOCK_DEVICE",
  "PRAYER_CLEAR_REPORTS",
  "SUPPORT_TICKET_UPDATE",
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const sp = (key: string) => {
    const v = searchParams[key];
    return typeof v === "string" ? v : undefined;
  };

  const action = sp("action");
  const q = sp("q");
  const from = sp("from");
  const to = sp("to");
  const page = Math.max(1, Number(sp("page")) || 1);

  const [result, stats] = await Promise.all([
    queryActivityLogs({ action, q, from, to, page, limit: 25 }),
    getActivityStats(),
  ]);

  const qs = new URLSearchParams();
  if (action) qs.set("action", action);
  if (q) qs.set("q", q);
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const qsString = qs.toString();
  const pageUrl = (p: number) =>
    qsString
      ? `/dashboard/activity?${qsString}&page=${p}`
      : `/dashboard/activity?page=${p}`;

  const statCards = [
    { label: "Total actions", value: stats.total },
    { label: "Logins", value: stats.byAction.LOGIN ?? 0 },
    { label: "Members added", value: stats.byAction.MEMBER_CREATE ?? 0 },
    { label: "Members edited", value: stats.byAction.MEMBER_UPDATE ?? 0 },
    { label: "Members deleted", value: stats.byAction.MEMBER_DELETE ?? 0 },
    { label: "Posts created", value: stats.byAction.POST_CREATE ?? 0 },
    { label: "Notif. resent", value: stats.byAction.NOTIFICATION_RESEND ?? 0 },
  ];

  return (
    <div className="container">
      <h1 className="page-title">Activity</h1>
      <p className="page-subtitle">
        Who did what — logins, member changes, notification actions and account
        approvals.
      </p>

      <div className="stats">
        {statCards.map((s) => (
          <div className="stat" key={s.label}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.value}</div>
          </div>
        ))}
      </div>

      <form className="filters" method="GET" action="/dashboard/activity">
        <div className="field">
          <label htmlFor="action">Action</label>
          <select id="action" name="action" defaultValue={action ?? ""}>
            <option value="">All actions</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {ACTION_LABELS[a]}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="q">Search</label>
          <input
            id="q"
            name="q"
            type="text"
            defaultValue={q ?? ""}
            placeholder="Admin or member name"
          />
        </div>

        <div className="field">
          <label htmlFor="from">From</label>
          <input id="from" name="from" type="date" defaultValue={from ?? ""} />
        </div>

        <div className="field">
          <label htmlFor="to">To</label>
          <input id="to" name="to" type="date" defaultValue={to ?? ""} />
        </div>

        <button type="submit" className="btn btn-primary">
          Apply
        </button>
        {qsString && (
          <a href="/dashboard/activity" className="btn btn-ghost">
            Reset
          </a>
        )}
      </form>

      <div className="card table-wrap">
        {result.items.length === 0 ? (
          <div className="empty-state">
            <h3>No activity found</h3>
            <p>Try adjusting the filters or check back after some actions.</p>
          </div>
        ) : (
          <table className="audit">
            <thead>
              <tr>
                <th>When</th>
                <th>Admin</th>
                <th>Action</th>
                <th>Target</th>
                <th>Changes</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((item) => (
                <tr key={item._id}>
                  <td className="time-cell">{formatDate(item.timestamp)}</td>
                  <td className="actor-cell">
                    {item.actorName}
                    <span className="actor-role">
                      {item.actorRole.toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <span className={`badge badge-${item.action}`}>
                      {ACTION_LABELS[item.action]}
                    </span>
                  </td>
                  <td>{item.targetName || <span className="muted">—</span>}</td>
                  <td>
                    <ChangesList item={item} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="pagination">
        <span>
          Showing page {result.page} of {result.totalPages} · {result.total}{" "}
          total
        </span>
        <div className="pagination-links">
          {result.page > 1 && (
            <a href={pageUrl(result.page - 1)} className="btn btn-ghost">
              ← Prev
            </a>
          )}
          {result.page < result.totalPages && (
            <a href={pageUrl(result.page + 1)} className="btn btn-ghost">
              Next →
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
