"use server";

import { revalidatePath } from "next/cache";
import { requireApprovedSession } from "@/lib/session";
import { connectDB } from "@/lib/mongodb";
import PrayerRequest from "@/models/PrayerRequest";
import { logActivity } from "@/lib/activity";
import { blockDevice, unblockDevice } from "@/lib/blockedDevices";

const MODERATOR_ROLES = ["admin", "staff"];

/** Short excerpt of the message for readable activity-log target names. */
function messageExcerpt(message: string): string {
  return message.length > 60 ? `${message.slice(0, 60)}…` : message;
}

async function requireModerator() {
  const session = await requireApprovedSession();
  if (!session || !MODERATOR_ROLES.includes(session.role)) {
    throw new Error("Not authorized");
  }
  return session;
}

async function loadRequest(id: string) {
  await connectDB();
  const req = await PrayerRequest.findById(id);
  if (!req) throw new Error("Prayer request not found");
  return req;
}

export async function hidePrayerRequest(formData: FormData) {
  const actor = await requireModerator();
  const id = String(formData.get("id") || "");
  const request = await loadRequest(id);
  await PrayerRequest.findByIdAndUpdate(id, { $set: { hidden: true } });
  await logActivity({
    actor,
    action: "PRAYER_HIDE",
    targetId: request._id.toString(),
    targetName: messageExcerpt(request.message),
  });
  revalidatePath("/dashboard/prayer-requests");
}

export async function unhidePrayerRequest(formData: FormData) {
  const actor = await requireModerator();
  const id = String(formData.get("id") || "");
  const request = await loadRequest(id);
  await PrayerRequest.findByIdAndUpdate(id, { $set: { hidden: false } });
  await logActivity({
    actor,
    action: "PRAYER_UNHIDE",
    targetId: request._id.toString(),
    targetName: messageExcerpt(request.message),
  });
  revalidatePath("/dashboard/prayer-requests");
}

/** DEV-29: mark a reviewed request as no longer reported (drops out of the queue). */
export async function clearPrayerReports(formData: FormData) {
  const actor = await requireModerator();
  const id = String(formData.get("id") || "");
  const request = await loadRequest(id);
  await PrayerRequest.findByIdAndUpdate(id, {
    $set: { reportedCount: 0, reportedBy: [] },
  });
  await logActivity({
    actor,
    action: "PRAYER_CLEAR_REPORTS",
    targetId: request._id.toString(),
    targetName: messageExcerpt(request.message),
  });
  revalidatePath("/dashboard/prayer-requests");
}

/** DEV-29: block the submitting device + hide the request (device-level blocking). */
export async function blockPrayerDevice(formData: FormData) {
  const actor = await requireModerator();
  const id = String(formData.get("id") || "");
  const reason = String(formData.get("reason") || "").trim();
  const request = await loadRequest(id);
  if (!request.deviceId) {
    throw new Error("This request has no device id to block");
  }
  await blockDevice({
    deviceId: request.deviceId,
    reason: reason || "Blocked from the prayer wall for inappropriate content",
    blockedBy: actor.email,
  });
  await PrayerRequest.findByIdAndUpdate(id, { $set: { hidden: true } });
  await logActivity({
    actor,
    action: "PRAYER_BLOCK_DEVICE",
    targetId: request._id.toString(),
    targetName: messageExcerpt(request.message),
    meta: { deviceId: request.deviceId, reason: reason || undefined },
  });
  revalidatePath("/dashboard/prayer-requests");
}

export async function unblockPrayerDevice(formData: FormData) {
  const actor = await requireModerator();
  const id = String(formData.get("id") || "");
  const request = await loadRequest(id);
  if (!request.deviceId) {
    throw new Error("This request has no device id to unblock");
  }
  await unblockDevice(request.deviceId);
  await logActivity({
    actor,
    action: "PRAYER_UNBLOCK_DEVICE",
    targetId: request._id.toString(),
    targetName: messageExcerpt(request.message),
    meta: { deviceId: request.deviceId },
  });
  revalidatePath("/dashboard/prayer-requests");
}

export async function deletePrayerRequest(formData: FormData) {
  const actor = await requireModerator();
  const id = String(formData.get("id") || "");
  const request = await loadRequest(id);
  await PrayerRequest.findByIdAndDelete(id);
  await logActivity({
    actor,
    action: "PRAYER_DELETE",
    targetId: request._id.toString(),
    targetName: messageExcerpt(request.message),
  });
  revalidatePath("/dashboard/prayer-requests");
}
