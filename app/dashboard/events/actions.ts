"use server";

import { revalidatePath } from "next/cache";
import { requireApprovedSession } from "@/lib/session";
import { connectDB } from "@/lib/mongodb";
import Event from "@/models/Event";
import { logActivity, diffFields } from "@/lib/activity";
import {
  getUploadSignature,
  isPublicHttpUrl,
  optimizeImageUrl,
  type UploadSignature,
} from "@/lib/cloudinary";
import {
  hasEventDayOrDate,
  EVENT_DESCRIPTION_DAY_DATE_ERROR,
} from "@/lib/eventDates";

// Users allowed to write events. Matches the event API write gate
// (backend/app/api/events/route.ts) and the dashboard moderation gate.
const WRITER_ROLES = ["admin", "staff"];

async function requireEventWriter() {
  const session = await requireApprovedSession();
  if (!session || !WRITER_ROLES.includes(session.role)) {
    throw new Error("Not authorized");
  }
  return session;
}

function trimOrEmpty(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Parses a datetime-local/ISO string into a Date, or null when blank/invalid. */
function parseDate(value: FormDataEntryValue | null): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface EventActionResult {
  success: boolean;
  error?: string;
  id?: string;
}

// POST /api/events equivalent — create an event (approved admin/staff only).
// Mirrors the API route so the dashboard and mobile app stay in sync.
export async function createEvent(
  formData: FormData,
): Promise<EventActionResult> {
  const actor = await requireEventWriter();
  await connectDB();

  const title = trimOrEmpty(formData.get("title"));
  const startsAt = parseDate(formData.get("startsAt"));
  if (!title || !startsAt) {
    return { success: false, error: "title and startsAt are required" };
  }

  // Events can run across multiple days/weeks/months (e.g. a revival every
  // Mon/Wed/Fri for two months), so the description must state which
  // day(s)/date(s) the event occurs on.
  const description = trimOrEmpty(formData.get("description"));
  if (!hasEventDayOrDate(description)) {
    return { success: false, error: EVENT_DESCRIPTION_DAY_DATE_ERROR };
  }

  const imageUrl = trimOrEmpty(formData.get("imageUrl"));
  if (imageUrl && !isPublicHttpUrl(imageUrl)) {
    return {
      success: false,
      error: "imageUrl must be a valid http(s) public URL",
    };
  }

  const event = await Event.create({
    title,
    description: trimOrEmpty(formData.get("description")),
    location: trimOrEmpty(formData.get("location")),
    startsAt,
    endsAt: parseDate(formData.get("endsAt")),
    imageUrl: imageUrl ? optimizeImageUrl(imageUrl) : null,
    createdBy: actor.userId,
  });

  // Audit: who created this event (same action as the API route).
  await logActivity({
    actor,
    action: "EVENT_CREATE",
    targetId: event._id.toString(),
    targetName: event.title,
  });

  revalidatePath("/dashboard/events");
  return { success: true, id: event._id.toString() };
}

// PUT /api/events/:id equivalent — update an event (approved admin/staff only).
export async function updateEvent(
  formData: FormData,
): Promise<EventActionResult> {
  const actor = await requireEventWriter();
  const id = trimOrEmpty(formData.get("id"));
  if (!id) return { success: false, error: "Event id is required" };

  await connectDB();
  const before = await Event.findById(id);
  if (!before) {
    return { success: false, error: "Event not found" };
  }

  const title = trimOrEmpty(formData.get("title"));
  const startsAt = parseDate(formData.get("startsAt"));
  if (!title || !startsAt) {
    return { success: false, error: "title and startsAt are required" };
  }

  // Same rule as create: the description must state the day(s)/date(s) the
  // event occurs on (events can span multiple days across weeks/months).
  const description = trimOrEmpty(formData.get("description"));
  if (!hasEventDayOrDate(description)) {
    return { success: false, error: EVENT_DESCRIPTION_DAY_DATE_ERROR };
  }

  const imageUrl = trimOrEmpty(formData.get("imageUrl"));
  if (imageUrl && !isPublicHttpUrl(imageUrl)) {
    return {
      success: false,
      error: "imageUrl must be a valid http(s) public URL",
    };
  }

  const patch = {
    title,
    description: trimOrEmpty(formData.get("description")),
    location: trimOrEmpty(formData.get("location")),
    startsAt,
    endsAt: parseDate(formData.get("endsAt")),
    imageUrl: imageUrl ? optimizeImageUrl(imageUrl) : null,
  };

  const event = await Event.findByIdAndUpdate(
    id,
    { $set: patch },
    { new: true, runValidators: true },
  );
  if (!event) {
    return { success: false, error: "Event not found" };
  }

  const changes = diffFields(before.toObject(), event.toObject());
  await logActivity({
    actor,
    action: "EVENT_UPDATE",
    targetId: event._id.toString(),
    targetName: event.title,
    changes,
  });

  revalidatePath("/dashboard/events");
  revalidatePath(`/dashboard/events/${id}`);
  return { success: true, id: event._id.toString() };
}

// DELETE /api/events/:id equivalent — soft delete (approved admin/staff only).
// Flips `deleted` so the event drops out of the public list but stays
// restorable (DEV-95).
export async function deleteEvent(formData: FormData): Promise<void> {
  const actor = await requireEventWriter();
  const id = trimOrEmpty(formData.get("id"));
  if (!id) throw new Error("Event id is required");

  await connectDB();
  const event = await Event.findByIdAndUpdate(
    id,
    {
      $set: {
        deleted: true,
        deletedAt: new Date(),
        deletedBy: actor.userId,
      },
    },
    { new: true },
  );
  if (!event) throw new Error("Event not found");

  await logActivity({
    actor,
    action: "EVENT_DELETE",
    targetId: event._id.toString(),
    targetName: event.title,
  });

  revalidatePath("/dashboard/events");
}

// POST /api/events/:id/restore equivalent — bring a soft-deleted event back.
export async function restoreEvent(formData: FormData): Promise<void> {
  const actor = await requireEventWriter();
  const id = trimOrEmpty(formData.get("id"));
  if (!id) throw new Error("Event id is required");

  await connectDB();
  const event = await Event.findByIdAndUpdate(
    id,
    {
      $set: {
        deleted: false,
        deletedAt: null,
        deletedBy: null,
      },
    },
    { new: true, runValidators: true },
  );
  if (!event) throw new Error("Event not found");

  await logActivity({
    actor,
    action: "EVENT_RESTORE",
    targetId: event._id.toString(),
    targetName: event.title,
  });

  revalidatePath("/dashboard/events");
}

/**
 * DEV-17 signed-upload flow for the dashboard: returns the params needed to
 * POST an image file DIRECTLY to Cloudinary (the raw bytes never transit a
 * serverless function). The client uploads, then stores the returned
 * secure_url on the event's imageUrl field.
 *
 * Gated the same way as the events write actions (approved admin/staff).
 */
export async function getEventUploadSignature(): Promise<UploadSignature> {
  await requireEventWriter();
  return getUploadSignature({ resourceType: "image" });
}
