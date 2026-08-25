import { redirect } from "next/navigation";
import Link from "next/link";
import { requireApprovedSession } from "@/lib/session";
import { fetchSupportTickets } from "@/lib/supportApi";
import TicketActions from "./TicketActions";

export const dynamic = "force-dynamic";

// Same moderation gate as the other management dashboards (posts, events,
// prayer-requests): approved admin/staff only. Non-moderators land on the
// activity feed instead of being shown the management UI.
const MODERATOR_ROLES = ["admin", "staff"];

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
};

// Status -> badge CSS class (matches the ticket badges added in globals.css).
const STATUS_BADGES: Record<string, string> = {
  open: "badge-ticket-open",
  in_progress: "badge-ticket-inprogress",
  resolved: "badge-ticket-resolved",
};

function formatDate(d: string | Date | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatDevice(deviceId?: string | null): string {
  if (!deviceId) return "—";
  return deviceId.length > 12
    ? `${deviceId.slice(0, 8)}…${deviceId.slice(-4)}`
    : deviceId;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge ${STATUS_BADGES[status] || "badge-ticket-open"}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

export default async function SupportPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const session = await requireApprovedSession();
  if (!session) redirect("/login");
  if (!MODERATOR_ROLES.includes(session.role)) {
    redirect("/dashboard/activity");
  }

  const sp = (key: string) => {
    const v = searchParams[key];
    return typeof v === "string" ? v : "";
  };
  const status = sp("status");
  const id = sp("id");

  // Counts for the filter tabs. Each call reads pagination.total, so we only
  // need limit=1 to get an accurate count per status (same trick the other
  // dashboard lists use to avoid loading every row just to count).
  const [allRes, openRes, inProgressRes, resolvedRes] = await Promise.all([
    fetchSupportTickets("", 1),
    fetchSupportTickets("open", 1),
    fetchSupportTickets("in_progress", 1),
    fetchSupportTickets("resolved", 1),
  ]);

  let tickets: any[] = [];
  let selected: any = null;

  if (id) {
    // Detail view: load the full (unfiltered) list so the ticket shows even if
    // it doesn't match the active status filter, then pick the one we want.
    const full = await fetchSupportTickets("", 100);
    tickets = full.data;
    selected = tickets.find((t) => t._id === id) || null;
  } else {
    const list = await fetchSupportTickets(status, 100);
    tickets = list.data;
  }

  const tabs = [
    { key: "", label: `All (${allRes.total})` },
    { key: "open", label: `Open (${openRes.total})` },
    { key: "in_progress", label: `In Progress (${inProgressRes.total})` },
    { key: "resolved", label: `Resolved (${resolvedRes.total})` },
  ];

  const backHref = status
    ? `/dashboard/support?status=${encodeURIComponent(status)}`
    : "/dashboard/support";

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Support Inbox</h1>
          <p className="page-subtitle">
            Support tickets submitted from the mobile app. Read the full report
            (including which screen it came from), reply, and move tickets
            through Open → In Progress → Resolved — every status change is
            reversible.
          </p>
        </div>
      </div>

      {id ? (
        // ── Detail view ───────────────────────────────────────────────
        selected ? (
          <div>
            <Link
              href={backHref}
              className="btn btn-ghost"
              style={{ marginBottom: 16 }}
            >
              ← Back to inbox
            </Link>

            <div className="card card-pad">
              <div className="ticket-detail-header">
                <h2 style={{ margin: 0 }}>{selected.subject}</h2>
                <StatusBadge status={selected.status} />
              </div>

              <div className="ticket-meta">
                <div>
                  <span className="ticket-meta-label">Submitted</span>
                  <span>{formatDate(selected.createdAt)}</span>
                </div>
                <div>
                  <span className="ticket-meta-label">Device</span>
                  <span title={selected.deviceId || undefined}>
                    {formatDevice(selected.deviceId)}
                  </span>
                </div>
                <div>
                  <span className="ticket-meta-label">Screen</span>
                  <span>{selected.screenContext || "—"}</span>
                </div>
                {selected.resolvedAt ? (
                  <div>
                    <span className="ticket-meta-label">Resolved</span>
                    <span>{formatDate(selected.resolvedAt)}</span>
                  </div>
                ) : null}
              </div>

              <div className="ticket-section">
                <h3 className="ticket-section-title">Reported message</h3>
                <div className="ticket-message">{selected.message}</div>
              </div>

              <TicketActions ticket={selected} backHref={backHref} />
            </div>
          </div>
        ) : (
          <div className="card empty-state">
            <h3>Ticket not found</h3>
            <p>
              It may have been removed, or is outside the first 100 tickets.
            </p>
            <Link href={backHref} className="btn btn-ghost">
              ← Back to inbox
            </Link>
          </div>
        )
      ) : (
        // ── List view ─────────────────────────────────────────────────
        <div>
          <div className="filter-tabs">
            {tabs.map((tab) => {
              const active = status === tab.key;
              const href =
                tab.key === ""
                  ? "/dashboard/support"
                  : `/dashboard/support?status=${tab.key}`;
              return (
                <Link
                  key={tab.key}
                  href={href}
                  className={active ? "filter-tab active" : "filter-tab"}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>

          <div className="card table-wrap">
            {tickets.length === 0 ? (
              <div className="empty-state">
                <h3>No support tickets found</h3>
                <p>
                  {status
                    ? "No tickets with this status right now."
                    : "Tickets reported from the app will appear here."}
                </p>
              </div>
            ) : (
              <table className="audit">
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th>Status</th>
                    <th>Device</th>
                    <th>Screen</th>
                    <th>Submitted</th>
                    <th>Reply</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((t: any) => {
                    const ticketId = t._id.toString();
                    return (
                      <tr key={ticketId}>
                        <td style={{ maxWidth: 320 }}>
                          <div className="ticket-title-cell">{t.subject}</div>
                          {t.message ? (
                            <div className="ticket-excerpt">
                              {t.message.length > 90
                                ? `${t.message.slice(0, 90)}…`
                                : t.message}
                            </div>
                          ) : null}
                        </td>
                        <td>
                          <StatusBadge status={t.status} />
                        </td>
                        <td
                          className="time-cell"
                          title={t.deviceId || undefined}
                        >
                          {formatDevice(t.deviceId)}
                        </td>
                        <td className="time-cell">
                          {t.screenContext || <span className="muted">—</span>}
                        </td>
                        <td className="time-cell">{formatDate(t.createdAt)}</td>
                        <td className="time-cell">
                          {t.adminResponse ? (
                            <span className="badge badge-ticket-replied">
                              Replied
                            </span>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td>
                          <Link
                            href={`/dashboard/support?id=${encodeURIComponent(
                              ticketId,
                            )}${status ? `&status=${encodeURIComponent(status)}` : ""}`}
                            className="btn btn-ghost"
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
