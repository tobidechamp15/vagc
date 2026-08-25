import { headers } from "next/headers";
import { getSessionToken } from "@/lib/session";

/**
 * Server-side helpers for the dashboard Support inbox (DEV-102).
 *
 * The dashboard reuses the SAME /api/support-tickets endpoints the mobile app
 * calls (DEV-101) instead of re-implementing ticket logic — the API owns the
 * status validation, resolvedAt bookkeeping, and SUPPORT_TICKET_UPDATE audit
 * trail. These helpers just forward the admin's session cookie as a Bearer
 * token so those routes authenticate exactly like the app does.
 */

/** Derives the same-origin base URL from the incoming request headers. */
export function apiBase(): string {
  const h = headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || "http";
  return `${proto}://${host}`;
}

/** Authenticated fetch to a same-origin API route using the session token. */
export async function supportApiFetch(path: string, init?: RequestInit) {
  const token = getSessionToken();
  return fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
}

/**
 * GET /api/support-tickets?status=...&limit=... -> admin triage list.
 * `status` may be "" (all), "open", "in_progress" or "resolved".
 */
export async function fetchSupportTickets(status: string, limit = 100) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  params.set("limit", String(limit));
  const res = await supportApiFetch(
    `/api/support-tickets?${params.toString()}`,
  );
  const data = await res.json().catch(() => ({}));
  return {
    data: data.data ?? [],
    total: data.pagination?.total ?? data.data?.length ?? 0,
  };
}

/**
 * PUT /api/support-tickets/:id -> update status and/or adminResponse.
 * Throws the backend's error message on failure.
 */
export async function updateSupportTicket(
  id: string,
  body: Record<string, unknown>,
) {
  const res = await supportApiFetch(
    `/api/support-tickets/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      body: JSON.stringify(body),
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Failed to update support ticket");
  }
  return data.data;
}
