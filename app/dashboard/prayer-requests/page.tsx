import { redirect } from "next/navigation";
import { requireApprovedSession } from "@/lib/session";
import { connectDB } from "@/lib/mongodb";
import PrayerRequest from "@/models/PrayerRequest";
import BlockedDevice from "@/models/BlockedDevice";
import {
  hidePrayerRequest,
  unhidePrayerRequest,
  clearPrayerReports,
  blockPrayerDevice,
  unblockPrayerDevice,
  deletePrayerRequest,
} from "./actions";

export const dynamic = "force-dynamic";

const MODERATOR_ROLES = ["admin", "staff"];

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

function StatusBadges({
  request,
  blocked,
}: {
  request: any;
  blocked: boolean;
}) {
  // Default for legacy rows written before DEV-29 (fields absent).
  const reportedCount = request.reportedCount || 0;
  const reported = reportedCount > 0;
  return (
    <>
      {reported && (
        <span className="badge badge-prayer-reported">
          Reported ({reportedCount})
        </span>
      )}
      {request.hidden && (
        <span className="badge badge-prayer-hidden">Hidden</span>
      )}
      {blocked && (
        <span className="badge badge-prayer-blocked">Device blocked</span>
      )}
      {!request.hidden && !reported && (
        <span className="badge badge-prayer-live">Live</span>
      )}
    </>
  );
}

function ReportReasons({ request }: { request: any }) {
  const reasons = (request.reportedBy || [])
    .map((r: any) => r.reason)
    .filter(Boolean);
  if (reasons.length === 0) return null;
  return (
    <div className="report-reasons">
      <strong>Reported for:</strong> {reasons.slice(0, 3).join(" · ")}
      {reasons.length > 3 ? ` (+${reasons.length - 3} more)` : ""}
    </div>
  );
}

function ActionButtons({
  request,
  blocked,
}: {
  request: any;
  blocked: boolean;
}) {
  const id = request._id.toString();
  return (
    <div className="row-actions">
      {request.hidden ? (
        <form action={unhidePrayerRequest}>
          <input type="hidden" name="id" value={id} />
          <button className="btn btn-ghost" type="submit">
            Un-hide
          </button>
        </form>
      ) : (
        <form action={hidePrayerRequest}>
          <input type="hidden" name="id" value={id} />
          <button className="btn btn-approve" type="submit">
            Hide
          </button>
        </form>
      )}
      {request.reportedCount > 0 && (
        <form action={clearPrayerReports}>
          <input type="hidden" name="id" value={id} />
          <button className="btn btn-ghost" type="submit">
            Clear reports
          </button>
        </form>
      )}
      {request.deviceId && !blocked && (
        <form action={blockPrayerDevice}>
          <input type="hidden" name="id" value={id} />
          <button
            className="btn btn-reject"
            type="submit"
            title="Blocks this device from the prayer wall and hides the request"
          >
            Block device
          </button>
        </form>
      )}
      {request.deviceId && blocked && (
        <form action={unblockPrayerDevice}>
          <input type="hidden" name="id" value={id} />
          <button className="btn btn-ghost" type="submit">
            Unblock device
          </button>
        </form>
      )}
      <form action={deletePrayerRequest}>
        <input type="hidden" name="id" value={id} />
        <button className="btn btn-reject" type="submit">
          Delete
        </button>
      </form>
    </div>
  );
}

export default async function PrayerRequestsPage({
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
  const q = sp("q").trim();

  await connectDB();

  const reportedFilter = { reportedCount: { $gt: 0 } };
  const hiddenFilter = { hidden: true };
  const liveFilter = { hidden: false, reportedCount: 0 };

  const filter: Record<string, unknown> =
    status === "reported"
      ? reportedFilter
      : status === "hidden"
        ? hiddenFilter
        : status === "live"
          ? liveFilter
          : {};
  if (q) {
    filter.$or = [
      { name: { $regex: q, $options: "i" } },
      { message: { $regex: q, $options: "i" } },
    ];
  }

  const [
    requests,
    blockedDevices,
    total,
    reportedCount,
    hiddenCount,
    liveCount,
  ] = await Promise.all([
    PrayerRequest.find(filter).sort({ createdAt: -1 }).limit(100).lean(),
    BlockedDevice.find().select("deviceId").lean(),
    PrayerRequest.countDocuments({}),
    PrayerRequest.countDocuments(reportedFilter),
    PrayerRequest.countDocuments(hiddenFilter),
    PrayerRequest.countDocuments(liveFilter),
  ]);

  const blockedIds = new Set(blockedDevices.map((b: any) => b.deviceId));

  const tabs = [
    { key: "", label: `All (${total})` },
    { key: "reported", label: `Reported (${reportedCount})` },
    { key: "hidden", label: `Hidden (${hiddenCount})` },
    { key: "live", label: `Live (${liveCount})` },
  ];

  return (
    <div className="container">
      <h1 className="page-title">Prayer Requests</h1>
      <p className="page-subtitle">
        Moderation queue — user-reported requests are flagged for review. Hidden
        requests are off the public wall; blocking a device stops that device
        from posting, reporting, or praying again.
      </p>

      <div className="stats">
        <div className="stat">
          <div className="stat-label">Reported</div>
          <div className="stat-value">{reportedCount}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Hidden</div>
          <div className="stat-value">{hiddenCount}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Live</div>
          <div className="stat-value">{liveCount}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Total</div>
          <div className="stat-value">{total}</div>
        </div>
      </div>

      <div className="filter-tabs">
        {tabs.map((tab) => {
          const active = status === tab.key;
          const href =
            tab.key === ""
              ? "/dashboard/prayer-requests"
              : `/dashboard/prayer-requests?status=${tab.key}`;
          return (
            <a
              key={tab.key}
              href={href}
              className={active ? "filter-tab active" : "filter-tab"}
            >
              {tab.label}
            </a>
          );
        })}
      </div>

      <form
        className="filters"
        method="GET"
        action="/dashboard/prayer-requests"
      >
        <div className="field">
          <label htmlFor="q">Search</label>
          <input
            id="q"
            name="q"
            type="text"
            defaultValue={q}
            placeholder="Message text or author name"
          />
        </div>
        {status && <input type="hidden" name="status" value={status} />}
        <button type="submit" className="btn btn-primary">
          Search
        </button>
        {(q || status) && (
          <a href="/dashboard/prayer-requests" className="btn btn-ghost">
            Reset
          </a>
        )}
      </form>

      <div className="card table-wrap">
        {requests.length === 0 ? (
          <div className="empty-state">
            <h3>No prayer requests found</h3>
            <p>
              {status === "reported"
                ? "No reported requests to review right now."
                : "Adjust the filter or check back after members share requests."}
            </p>
          </div>
        ) : (
          <table className="audit">
            <thead>
              <tr>
                <th>Author</th>
                <th>Message</th>
                <th>Status</th>
                <th>Device</th>
                <th>Posted</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r: any) => {
                const blocked = !!r.deviceId && blockedIds.has(r.deviceId);
                return (
                  <tr key={r._id.toString()}>
                    <td className="actor-cell">{r.name || "Anonymous"}</td>
                    <td style={{ maxWidth: 320 }}>
                      {r.message}
                      <ReportReasons request={r} />
                    </td>
                    <td>
                      <StatusBadges request={r} blocked={blocked} />
                    </td>
                    <td className="time-cell" title={r.deviceId || undefined}>
                      {formatDevice(r.deviceId)}
                    </td>
                    <td className="time-cell">{formatDate(r.createdAt)}</td>
                    <td>
                      <ActionButtons request={r} blocked={blocked} />
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
