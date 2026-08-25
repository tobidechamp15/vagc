import { redirect } from "next/navigation";
import { requireApprovedSession } from "@/lib/session";
import { connectDB } from "@/lib/mongodb";
import Event from "@/models/Event";
import { restoreEvent } from "./actions";
import DeleteEventButton from "./DeleteEventButton";

export const dynamic = "force-dynamic";

// Same moderation gate as the other management dashboards (posts,
// prayer-requests): approved admin/staff only. Non-moderators land on the
// activity feed instead of being shown the management UI.
const MODERATOR_ROLES = ["admin", "staff"];

function formatDate(d: string | Date | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function EventsPage({
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
  const showDeleted = sp("showDeleted") === "1";
  const q = sp("q").trim();

  await connectDB();

  // Deleted (soft-deleted per DEV-95) events are only shown when the admin
  // toggles "Deleted" — that's where the Restore action lives, so a deleted
  // event is never silently gone with no trace.
  const filter: Record<string, unknown> = showDeleted
    ? { deleted: true }
    : { deleted: { $ne: true } };
  if (q) {
    filter.$or = [
      { title: { $regex: q, $options: "i" } },
      { location: { $regex: q, $options: "i" } },
      { description: { $regex: q, $options: "i" } },
    ];
  }

  const now = new Date();
  const [events, total, upcomingCount, deletedCount, rsvpAgg] =
    await Promise.all([
      Event.find(filter).sort({ startsAt: -1 }).limit(200).lean(),
      Event.countDocuments(
        showDeleted ? { deleted: true } : { deleted: { $ne: true } },
      ),
      Event.countDocuments({ deleted: { $ne: true }, startsAt: { $gte: now } }),
      Event.countDocuments({ deleted: true }),
      Event.aggregate<{ total: number }>([
        { $match: { deleted: { $ne: true } } },
        { $project: { count: { $size: "$rsvps" } } },
        { $group: { _id: null, total: { $sum: "$count" } } },
      ]),
    ]);

  const rsvpCount = rsvpAgg[0]?.total ?? 0;

  const tabs = [
    {
      key: "",
      label: `Active (${total})`,
      href: "/dashboard/events",
      active: !showDeleted,
    },
    {
      key: "deleted",
      label: `Deleted (${deletedCount})`,
      href: "/dashboard/events?showDeleted=1",
      active: showDeleted,
    },
  ];

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Events</h1>
          <p className="page-subtitle">
            Everything the mobile app shows on the public events list. Create
            and edit events here; deleting moves an event to the Deleted tab
            (soft delete) where it can be restored.
          </p>
        </div>
        <a href="/dashboard/events/new" className="btn btn-primary">
          + New event
        </a>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="stat-label">Active events</div>
          <div className="stat-value">{total}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Upcoming</div>
          <div className="stat-value">{upcomingCount}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Total RSVPs</div>
          <div className="stat-value">{rsvpCount}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Deleted</div>
          <div className="stat-value">{deletedCount}</div>
        </div>
      </div>

      <div className="filter-tabs">
        {tabs.map((tab) => (
          <a
            key={tab.key}
            href={tab.href}
            className={tab.active ? "filter-tab active" : "filter-tab"}
          >
            {tab.label}
          </a>
        ))}
      </div>

      <form className="filters" method="GET" action="/dashboard/events">
        <div className="field">
          <label htmlFor="q">Search</label>
          <input
            id="q"
            name="q"
            type="text"
            defaultValue={q}
            placeholder="Title, location or description"
          />
        </div>
        {showDeleted && <input type="hidden" name="showDeleted" value="1" />}
        <button type="submit" className="btn btn-primary">
          Search
        </button>
        {(q || showDeleted) && (
          <a href="/dashboard/events" className="btn btn-ghost">
            Reset
          </a>
        )}
      </form>

      <div className="card table-wrap">
        {events.length === 0 ? (
          <div className="empty-state">
            <h3>{showDeleted ? "No deleted events" : "No events found"}</h3>
            <p>
              {showDeleted
                ? "Events you delete will appear here, ready to be restored."
                : q
                  ? "Try a different search term."
                  : "Create your first event with the “+ New event” button."}
            </p>
          </div>
        ) : (
          <table className="audit">
            <thead>
              <tr>
                <th>Title</th>
                <th>When</th>
                <th>Location</th>
                <th>RSVPs</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e: any) => {
                const id = e._id.toString();
                return (
                  <tr
                    key={id}
                    className={e.deleted ? "row-deleted" : undefined}
                  >
                    <td style={{ maxWidth: 280 }}>
                      <div className="event-title-cell">
                        {e.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={e.imageUrl}
                            alt=""
                            className="event-thumb"
                          />
                        ) : null}
                        <span>{e.title}</span>
                      </div>
                      {e.description ? (
                        <div
                          className="event-description"
                          style={{ color: "var(--text-muted)", fontSize: 12 }}
                        >
                          {e.description.length > 80
                            ? `${e.description.slice(0, 80)}…`
                            : e.description}
                        </div>
                      ) : null}
                    </td>
                    <td className="time-cell">{formatDate(e.startsAt)}</td>
                    <td>{e.location || <span className="muted">—</span>}</td>
                    <td>{(e.rsvps || []).length}</td>
                    <td>
                      {e.deleted ? (
                        <span className="badge badge-event-deleted">
                          Deleted
                        </span>
                      ) : (
                        <span className="badge badge-event-live">Active</span>
                      )}
                    </td>
                    <td>
                      <div className="row-actions">
                        {e.deleted ? (
                          <form action={restoreEvent}>
                            <input type="hidden" name="id" value={id} />
                            <button className="btn btn-approve" type="submit">
                              Restore
                            </button>
                          </form>
                        ) : (
                          <>
                            <a
                              href={`/dashboard/events/${id}`}
                              className="btn btn-ghost"
                            >
                              Edit
                            </a>
                            <DeleteEventButton id={id} title={e.title} />
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
