"use server";

import { revalidatePath } from "next/cache";
import { requireApprovedSession } from "@/lib/session";
import { updateSupportTicket } from "@/lib/supportApi";

// Same moderation gate as the other management dashboards (posts, events,
// prayer-requests) — approved admin/staff only.
const MODERATOR_ROLES = ["admin", "staff"];

const VALID_STATUSES = ["open", "in_progress", "resolved"];

/**
 * Server actions for the Support inbox (DEV-102).
 *
 * Every mutation is a thin proxy to the SAME PUT /api/support-tickets/:id
 * endpoint the mobile app uses (DEV-101) — no ticket logic is re-implemented
 * here. The API validates statuses, keeps resolvedAt consistent, and writes
 * the SUPPORT_TICKET_UPDATE audit trail. These actions exist only so the web
 * dashboard (which authenticates via the httpOnly session cookie) can forward
 * the admin's token to the API.
 */

async function requireModerator() {
  const session = await requireApprovedSession();
  if (!session || !MODERATOR_ROLES.includes(session.role)) {
    throw new Error("Not authorized");
  }
  return session;
}

export interface SupportActionResult {
  success: boolean;
  error?: string;
}

/** Change a ticket's status. All three statuses are valid targets — fully reversible. */
export async function updateSupportTicketStatus(
  formData: FormData,
): Promise<SupportActionResult> {
  try {
    await requireModerator();
    const id = String(formData.get("id") || "").trim();
    const status = String(formData.get("status") || "").trim();
    if (!id) return { success: false, error: "Missing ticket id" };
    if (!VALID_STATUSES.includes(status)) {
      return { success: false, error: "Invalid status" };
    }
    await updateSupportTicket(id, { status });
    revalidatePath("/dashboard/support");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to update status" };
  }
}

/** Save (or clear) the admin's response on a ticket. */
export async function updateSupportTicketResponse(
  formData: FormData,
): Promise<SupportActionResult> {
  try {
    await requireModerator();
    const id = String(formData.get("id") || "").trim();
    const adminResponse = String(formData.get("adminResponse") || "").trim();
    if (!id) return { success: false, error: "Missing ticket id" };
    await updateSupportTicket(id, { adminResponse: adminResponse || null });
    revalidatePath("/dashboard/support");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to save response" };
  }
}
