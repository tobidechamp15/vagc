"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./prayer-wall.module.css";
import { getWebDeviceId } from "../../lib/webDeviceId";

// ── Types (public wall shape — see GET /api/prayer-requests) ────────────────

type PrayerRequestItem = {
  _id: string;
  name?: string | null;
  message: string;
  prayedForCount: number;
  hidden: boolean;
  createdAt?: string;
  updatedAt?: string;
  // Public responses include prayedBy (only the requester's deviceId and the
  // moderation fields are stripped) so the client can render the "prayed"
  // state without a round-trip.
  prayedBy?: { deviceId: string; prayedAt: string }[];
};

type PrayerRequestPage = {
  success: boolean;
  data: PrayerRequestItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
};

/** Compact "5m ago" style timestamp — same as the mobile wall. */
function timeAgo(iso?: string): string {
  if (!iso) return "";
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/**
 * fetch helper that unwraps the API's JSON envelope and turns HTTP errors
 * (including the 403 device-block responses) into typed Errors carrying the
 * status so the UI can react to a block specifically.
 */
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  let body: { success?: boolean; error?: string; data?: unknown } | null = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok || body?.success === false) {
    const err = new Error(
      body?.error || "Something went wrong. Please try again.",
    ) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return body as unknown as T;
}

export default function PrayerWallClient() {
  const APP_NAME = "Victory and Glory Center";

  // DEV-29: the anonymous browser device id. Sent with every public action so
  // a blocked device is rejected server-side (403).
  const [deviceId, setDeviceId] = useState<string | null>(null);

  // Wall list + pagination.
  const [requests, setRequests] = useState<PrayerRequestItem[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Compose form.
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Feedback.
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // DEV-29: once the server tells us this device is blocked (403), show a
  // banner and disable every public action.
  const [blocked, setBlocked] = useState(false);

  // Per-request interaction state.
  const [pendingPray, setPendingPray] = useState<Record<string, boolean>>({});
  const [pendingReport, setPendingReport] = useState<Record<string, boolean>>(
    {},
  );
  const [reported, setReported] = useState<Record<string, boolean>>({});

  // Resolve the persisted browser device id once on mount.
  useEffect(() => {
    let active = true;
    getWebDeviceId().then((id) => {
      if (active && id) setDeviceId(id);
    });
    return () => {
      active = false;
    };
  }, []);

  const loadPage = useCallback(async (pageNum: number, append: boolean) => {
    try {
      const res = await api<PrayerRequestPage>(
        `/api/prayer-requests?page=${pageNum}&limit=20`,
      );
      setRequests((prev) => (append ? [...prev, ...res.data] : res.data));
      setPage(res.pagination.page);
      setHasMore(res.pagination.hasMore);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    loadPage(1, false);
  }, [loadPage]);

  /** Central error handling: a 403 means this device is blocked. */
  const handleActionError = useCallback((err: any) => {
    if (err?.status === 403) setBlocked(true);
    setError(err?.message || "Something went wrong. Please try again.");
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!deviceId) {
        setError("Preparing your device… try again in a moment.");
        return;
      }
      const trimmed = message.trim();
      if (!trimmed || submitting) return;
      setSubmitting(true);
      setError(null);
      setNotice(null);
      try {
        const res = await api<{ success: boolean; data: PrayerRequestItem }>(
          "/api/prayer-requests",
          {
            method: "POST",
            body: JSON.stringify({
              message: trimmed,
              name: name.trim() || undefined,
              deviceId,
            }),
          },
        );
        setRequests((prev) => [res.data, ...prev]);
        setMessage("");
        setName("");
        setNotice("Your prayer request has been shared. 🙏");
      } catch (err: any) {
        handleActionError(err);
      } finally {
        setSubmitting(false);
      }
    },
    [deviceId, message, name, submitting, handleActionError],
  );

  const handlePray = useCallback(
    async (item: PrayerRequestItem) => {
      if (!deviceId || pendingPray[item._id]) return;
      const prayed = (item.prayedBy ?? []).some((r) => r.deviceId === deviceId);
      setPendingPray((p) => ({ ...p, [item._id]: true }));
      setError(null);
      setNotice(null);
      try {
        const res = await api<{
          success: boolean;
          data: { prayerRequest: PrayerRequestItem };
        }>(`/api/prayer-requests/${item._id}/pray`, {
          method: prayed ? "DELETE" : "POST",
          body: JSON.stringify({ deviceId }),
        });
        const updated = res.data.prayerRequest;
        setRequests((prev) =>
          prev.map((r) => (r._id === item._id ? updated : r)),
        );
      } catch (err: any) {
        handleActionError(err);
      } finally {
        setPendingPray((p) => ({ ...p, [item._id]: false }));
      }
    },
    [deviceId, pendingPray, handleActionError],
  );

  const handleReport = useCallback(
    async (item: PrayerRequestItem) => {
      if (!deviceId || reported[item._id] || pendingReport[item._id]) return;
      if (
        !window.confirm(
          "Flag this prayer request for the church team to review? Reported content is checked by our staff.",
        )
      ) {
        return;
      }
      setPendingReport((p) => ({ ...p, [item._id]: true }));
      setError(null);
      setNotice(null);
      try {
        await api(`/api/prayer-requests/${item._id}/report`, {
          method: "POST",
          body: JSON.stringify({ deviceId }),
        });
        setReported((r) => ({ ...r, [item._id]: true }));
        setNotice("Thanks — this request has been flagged for review.");
      } catch (err: any) {
        handleActionError(err);
      } finally {
        setPendingReport((p) => ({ ...p, [item._id]: false }));
      }
    },
    [deviceId, reported, pendingReport, handleActionError],
  );

  const handleLoadMore = useCallback(() => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    loadPage(page + 1, true);
  }, [hasMore, loadingMore, loadPage, page]);

  return (
    <main className={styles.wrap}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.brandBadge}>VG</span>
          <span>{APP_NAME}</span>
        </div>
        <nav className={styles.nav}>
          <a href="/give">Giving</a>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
        </nav>
      </header>

      <div className={styles.container}>
        <section className={styles.hero}>
          <h1 className={styles.title}>Prayer Wall</h1>
          <p className={styles.effective}>
            Share a request with the church community and pray for the requests
            of others. You can post anonymously.
          </p>
        </section>

        {/* DEV-29: blocked-device banner — surfaced whenever any public action
            returns 403. */}
        {blocked && (
          <div className={styles.blockedBanner} role="alert">
            <strong>Your device is blocked from the prayer wall.</strong>{" "}
            Contact the church if you believe this is a mistake.
          </div>
        )}

        {error && (
          <div className={styles.errorBanner} role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className={styles.noticeBanner} role="status">
            {notice}
          </div>
        )}

        {/* Compose card */}
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Share a prayer request</h2>
          <form onSubmit={handleSubmit} className={styles.form}>
            <label className={styles.field}>
              <span>Name (optional)</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                placeholder="Your name — or leave blank to post anonymously"
                disabled={blocked || !deviceId}
              />
            </label>
            <label className={styles.field}>
              <span>Your request</span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={2000}
                rows={4}
                placeholder="Share what the church can pray for…"
                disabled={blocked || !deviceId}
                required
              />
            </label>
            <div className={styles.formRow}>
              <span className={styles.counter}>{message.length}/2000</span>
              <button
                type="submit"
                className={styles.primaryBtn}
                disabled={blocked || !deviceId || submitting || !message.trim()}
              >
                {submitting ? "Sharing…" : "Share prayer request"}
              </button>
            </div>
          </form>
        </section>

        {/* Wall list */}
        <section className={styles.listHeader}>
          <h2 className={styles.cardTitle}>Recent requests</h2>
          <button
            type="button"
            className={styles.ghostBtn}
            onClick={() => loadPage(1, false)}
            disabled={loading}
          >
            Refresh
          </button>
        </section>

        {loading ? (
          <div className={styles.empty}>
            <p>Loading the prayer wall…</p>
          </div>
        ) : requests.length === 0 ? (
          <div className={styles.empty}>
            <p>No prayer requests yet — be the first to share one.</p>
          </div>
        ) : (
          <ul className={styles.list}>
            {requests.map((item) => {
              const prayed = deviceId
                ? (item.prayedBy ?? []).some((r) => r.deviceId === deviceId)
                : false;
              const isPending = pendingPray[item._id];
              const isReportPending = pendingReport[item._id];
              const isReported = reported[item._id];
              return (
                <li key={item._id} className={styles.requestCard}>
                  <div className={styles.requestTop}>
                    <div className={styles.avatar} aria-hidden="true">
                      🙏
                    </div>
                    <div className={styles.requestMeta}>
                      <span className={styles.requestName}>
                        {item.name || "Anonymous"}
                      </span>
                      <span className={styles.requestTime}>
                        {timeAgo(item.createdAt)}
                      </span>
                    </div>
                    <button
                      type="button"
                      className={styles.reportBtn}
                      onClick={() => handleReport(item)}
                      disabled={
                        blocked || !deviceId || isReported || isReportPending
                      }
                      title={
                        isReported
                          ? "You reported this request"
                          : "Report this request"
                      }
                    >
                      {isReported ? "Reported" : "Report"}
                    </button>
                  </div>
                  <p className={styles.message}>{item.message}</p>
                  <div className={styles.requestActions}>
                    <button
                      type="button"
                      className={prayed ? styles.prayedBtn : styles.prayBtn}
                      onClick={() => handlePray(item)}
                      disabled={blocked || !deviceId || isPending}
                    >
                      {isPending
                        ? "…"
                        : prayed
                          ? "Prayed ❤️"
                          : "🙏 Pray for this"}
                      <span className={styles.count}>
                        {item.prayedForCount}
                      </span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {hasMore && (
          <div className={styles.loadMoreWrap}>
            <button
              type="button"
              className={styles.ghostBtn}
              onClick={handleLoadMore}
              disabled={loadingMore}
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
