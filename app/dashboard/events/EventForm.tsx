"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createEvent, updateEvent, getEventUploadSignature } from "./actions";
import {
  hasEventDayOrDate,
  EVENT_DESCRIPTION_DAY_DATE_ERROR,
} from "@/lib/eventDates";

/**
 * Create / edit event form for the dashboard.
 *
 * Image field reuses the DEV-17 signed-upload flow: the file is POSTed
 * DIRECTLY to Cloudinary (the raw bytes never transit a serverless function)
 * using a signature obtained from the gated server action. The returned
 * secure_url is stored on the event's imageUrl field, which the mobile app
 * renders directly.
 */

interface EventFormProps {
  event?: {
    _id: string;
    title: string;
    description: string;
    location: string;
    startsAt: string | null;
    endsAt: string | null;
    imageUrl: string | null;
  } | null;
}

/** "2026-08-20T14:30" (local) -> ISO 8601 (UTC) for storage. */
function toIso(datetimeLocal: string): string {
  if (!datetimeLocal) return "";
  const d = new Date(datetimeLocal);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

/** ISO 8601 -> local "YYYY-MM-DDTHH:mm" for the <input type="datetime-local">. */
function toDatetimeLocal(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export default function EventForm({ event }: EventFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageUrl, setImageUrl] = useState(event?.imageUrl || "");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const editing = !!event;

  async function handleImageChange(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    // Images only — the events image field renders as a photo in the app.
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file (jpg, png, webp, …).");
      return;
    }

    setUploading(true);
    setError(null);
    try {
      // 1. Fetch signed params for a direct-to-Cloudinary image upload.
      const sig = await getEventUploadSignature();
      // 2. POST the raw file straight to Cloudinary — never through our server.
      const body = new FormData();
      body.append("file", file);
      body.append("api_key", sig.apiKey);
      body.append("timestamp", String(sig.timestamp));
      body.append("folder", sig.folder);
      body.append("signature", sig.signature);

      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`,
        { method: "POST", body },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.secure_url) {
        throw new Error(data?.error?.message || "Image upload failed.");
      }
      // 3. Keep the CDN URL to persist on the event.
      setImageUrl(data.secure_url);
    } catch (err: any) {
      setError(err?.message || "Image upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleSubmit(formData: FormData) {
    // Normalize the local datetime inputs to UTC ISO strings for the DB.
    formData.set("startsAt", toIso(String(formData.get("startsAt") || "")));
    formData.set("endsAt", toIso(String(formData.get("endsAt") || "")));
    formData.set("imageUrl", imageUrl || "");

    // Client-side check (the server enforces this too): the description must
    // say which day(s)/date(s) the event occurs on — events like a revival can
    // span three days a week for two months.
    const description = String(formData.get("description") || "").trim();
    if (!hasEventDayOrDate(description)) {
      setError(EVENT_DESCRIPTION_DAY_DATE_ERROR);
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const res = editing
          ? await updateEvent(formData)
          : await createEvent(formData);
        if (!res.success) {
          setError(res.error || "Something went wrong. Please try again.");
          return;
        }
        router.push("/dashboard/events");
        router.refresh();
      } catch (err: any) {
        setError(err?.message || "Something went wrong. Please try again.");
      }
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit(new FormData(e.currentTarget));
      }}
    >
      <input type="hidden" name="id" value={event?._id || ""} />

      <div className="event-form-grid">
        <div className="field">
          <label htmlFor="title">Title *</label>
          <input
            id="title"
            name="title"
            type="text"
            required
            maxLength={200}
            defaultValue={event?.title || ""}
            placeholder="e.g. Sunday Service — Youth Sunday"
          />
        </div>

        <div className="field">
          <label htmlFor="location">Location</label>
          <input
            id="location"
            name="location"
            type="text"
            maxLength={200}
            defaultValue={event?.location || ""}
            placeholder="e.g. Main Auditorium"
          />
        </div>

        <div className="field">
          <label htmlFor="startsAt">Starts *</label>
          <input
            id="startsAt"
            name="startsAt"
            type="datetime-local"
            required
            defaultValue={toDatetimeLocal(event?.startsAt)}
          />
        </div>

        <div className="field">
          <label htmlFor="endsAt">Ends</label>
          <input
            id="endsAt"
            name="endsAt"
            type="datetime-local"
            defaultValue={toDatetimeLocal(event?.endsAt)}
          />
        </div>

        <div className="field field-full">
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            name="description"
            rows={4}
            defaultValue={event?.description || ""}
            placeholder="What should members know about this event?"
          />
          <p className="field-hint">
            Include the day(s) or date(s) the event occurs on — e.g. “Every
            Monday & Wednesday” or “12th–14th August 2026”. An event like a
            revival can span three days a week for two months.
          </p>
        </div>

        <div className="field field-full">
          <label htmlFor="image">Image</label>
          <div className="image-upload">
            {imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl}
                alt="Event cover preview"
                className="image-upload-preview"
              />
            ) : (
              <div className="image-upload-placeholder">
                No image — upload a cover photo for the event.
              </div>
            )}
            <input
              ref={fileInputRef}
              id="image"
              name="image"
              type="file"
              accept="image/*"
              disabled={uploading}
              onChange={(e) => handleImageChange(e.target.files)}
            />
            <input type="hidden" name="imageUrl" value={imageUrl} />
            {uploading && (
              <span className="image-upload-status">Uploading…</span>
            )}
            {imageUrl && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setImageUrl("")}
              >
                Remove image
              </button>
            )}
          </div>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="form-actions">
        <button
          type="submit"
          className="btn btn-primary"
          disabled={isPending || uploading}
        >
          {isPending
            ? editing
              ? "Saving…"
              : "Creating…"
            : editing
              ? "Save changes"
              : "Create event"}
        </button>
        <a href="/dashboard/events" className="btn btn-ghost">
          Cancel
        </a>
      </div>
    </form>
  );
}
