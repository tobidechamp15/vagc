"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  updateSupportTicketStatus,
  updateSupportTicketResponse,
  type SupportActionResult,
} from "./actions";

/**
 * Client-side actions card for a single support ticket (DEV-102).
 *
 * Two independent forms — the status changer and the response editor — each
 * submit to the same PUT /api/support-tickets/:id endpoint the mobile inbox
 * uses (via the server actions in ./actions). Status is fully reversible: all
 * three options are always selectable, and the backend accepts any valid
 * target regardless of the current value.
 */

interface TicketActionsProps {
  ticket: {
    _id: string;
    status: string;
    adminResponse?: string | null;
  };
  backHref: string;
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
];

export default function TicketActions({
  ticket,
  backHref,
}: TicketActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [statusMsg, setStatusMsg] = useState<{
    ok?: string;
    error?: string;
  } | null>(null);
  const [responseMsg, setResponseMsg] = useState<{
    ok?: string;
    error?: string;
  } | null>(null);

  function runStatus(formData: FormData) {
    setStatusMsg(null);
    startTransition(async () => {
      const res: SupportActionResult =
        await updateSupportTicketStatus(formData);
      if (!res.success) {
        setStatusMsg({ error: res.error || "Failed to update status." });
        return;
      }
      setStatusMsg({ ok: "Status updated." });
      router.refresh();
    });
  }

  function runResponse(formData: FormData) {
    setResponseMsg(null);
    startTransition(async () => {
      const res: SupportActionResult =
        await updateSupportTicketResponse(formData);
      if (!res.success) {
        setResponseMsg({ error: res.error || "Failed to save response." });
        return;
      }
      setResponseMsg({ ok: "Response saved." });
      router.refresh();
    });
  }

  return (
    <>
      {/* ── Status changer (fully reversible) ── */}
      <div className="ticket-section">
        <h3 className="ticket-section-title">Status</h3>
        <form
          action={runStatus}
          className="ticket-status-form"
          style={{ display: "flex", alignItems: "flex-end", gap: 10 }}
        >
          <input type="hidden" name="id" value={ticket._id} />
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor={`status-${ticket._id}`}>Change status</label>
            <select
              id={`status-${ticket._id}`}
              name="status"
              defaultValue={ticket.status}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <button
            className="btn btn-primary"
            type="submit"
            disabled={isPending}
          >
            {isPending ? "Saving…" : "Update status"}
          </button>
        </form>
        {statusMsg?.ok ? (
          <div className="form-note form-note-ok">{statusMsg.ok}</div>
        ) : null}
        {statusMsg?.error ? (
          <div className="form-note form-note-error">{statusMsg.error}</div>
        ) : null}
      </div>

      {/* ── Admin response ── */}
      <div className="ticket-section">
        <h3 className="ticket-section-title">Admin response</h3>
        <form
          action={runResponse}
          style={{ display: "flex", flexDirection: "column", gap: 10 }}
        >
          <input type="hidden" name="id" value={ticket._id} />
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor={`response-${ticket._id}`}>
              Reply to the member (leave empty to clear)
            </label>
            <textarea
              id={`response-${ticket._id}`}
              name="adminResponse"
              rows={4}
              maxLength={2000}
              defaultValue={ticket.adminResponse || ""}
              placeholder="What should the member know?"
            />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              className="btn btn-primary"
              type="submit"
              disabled={isPending}
            >
              {isPending ? "Saving…" : "Save response"}
            </button>
            <Link href={backHref} className="btn btn-ghost">
              Back to inbox
            </Link>
          </div>
        </form>
        {responseMsg?.ok ? (
          <div className="form-note form-note-ok">{responseMsg.ok}</div>
        ) : null}
        {responseMsg?.error ? (
          <div className="form-note form-note-error">{responseMsg.error}</div>
        ) : null}
      </div>
    </>
  );
}
