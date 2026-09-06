"use client";

import { useState, type FormEvent } from "react";
import styles from "./feedback.module.css";
import { getWebDeviceId } from "@/lib/webDeviceId";

// ── Constants shared with the API contract (see models/SupportTicket.ts) ─────
// The ticket's `message` is capped at 2000 chars server-side, so the form caps
// its total (feedback text + any appended contact line) at that budget.
const MESSAGE_API_MAX = 2000;
const CONTACT_MAX = 120;
const STAR_LABELS = [
  "No rating",
  "Not good",
  "Okay",
  "Good",
  "Very good",
  "Excellent",
];

type Status = "idle" | "submitting" | "success" | "error";

const RATE_LIMIT_MESSAGE =
  "You've already sent feedback recently. Please wait a few minutes and try again.";

export default function FeedbackClient() {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorText, setErrorText] = useState("");

  const contactTrimmed = contact.trim();

  // Reserve room for the "— Contact: …" line so the composed ticket message
  // never exceeds the API's 2000-char limit.
  const messageMax = contactTrimmed
    ? Math.max(1, MESSAGE_API_MAX - (contactTrimmed.length + 2))
    : MESSAGE_API_MAX;

  const shownStar = hover || rating;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = message.trim();
    if (!text) {
      setErrorText("Please write a short note so we know what to improve.");
      setStatus("error");
      return;
    }

    setStatus("submitting");
    setErrorText("");

    try {
      // Same anonymous browser device id the prayer wall uses, so a feedback
      // ticket ties back to a device the way mobile-app reports do.
      const deviceId = await getWebDeviceId();
      const composedMessage = contactTrimmed
        ? `${text}\n\n— Contact: ${contactTrimmed}`
        : text;

      const res = await fetch("/api/support-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId,
          subject: rating > 0 ? `App feedback — ${rating}/5` : "App feedback",
          message: composedMessage,
          screenContext: "web:/feedback",
        }),
      });

      if (res.status === 429) {
        setErrorText(RATE_LIMIT_MESSAGE);
        setStatus("error");
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorText(
          data?.error || "Something went wrong sending your feedback.",
        );
        setStatus("error");
        return;
      }

      setStatus("success");
    } catch {
      setErrorText(
        "Couldn't connect right now. Please check your connection and try again.",
      );
      setStatus("error");
    }
  }

  function reset() {
    setRating(0);
    setHover(0);
    setMessage("");
    setContact("");
    setStatus("idle");
    setErrorText("");
  }

  if (status === "success") {
    return (
      <div className={styles.success}>
        <h3 className={styles.successTitle}>Thank you for your feedback!</h3>
        <p className={styles.successText}>
          Your feedback has been sent to the Victory and Glory Center team. We
          read every message and use it to improve the app.
        </p>
        <button type="button" className={styles.again} onClick={reset}>
          Send another
        </button>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      {status === "error" && errorText ? (
        <div className={styles.formError} role="alert">
          {errorText}
        </div>
      ) : null}

      {/* ── Rating ── */}
      <div className={styles.field}>
        <span className={styles.label}>
          How would you rate the app?{" "}
          <span className={styles.optional}>Optional</span>
        </span>
        <div className={styles.starRow}>
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              aria-label={`${STAR_LABELS[value]} — ${value} out of 5`}
              aria-pressed={rating === value}
              className={`${styles.star} ${
                value <= shownStar ? styles.starOn : ""
              }`}
              onClick={() => setRating(value)}
              onMouseEnter={() => setHover(value)}
              onMouseLeave={() => setHover(0)}
            >
              ★
            </button>
          ))}
        </div>
        <div className={styles.starLabel}>
          {rating > 0 ? STAR_LABELS[rating] : "Tap a star to rate"}
        </div>
      </div>

      {/* ── Message ── */}
      <div className={styles.field}>
        <label className={styles.label} htmlFor="feedback-message">
          What could we improve? <span style={{ color: "#b42318" }}>*</span>
        </label>
        <textarea
          id="feedback-message"
          className={styles.textarea}
          value={message}
          maxLength={messageMax}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tell us what you like or what we can do better — bugs, ideas, or anything on your mind."
        />
        <div className={styles.hintRow}>
          <span />
          <span>
            {message.length}/{messageMax}
          </span>
        </div>
      </div>

      {/* ── Optional contact ── */}
      <div className={styles.field}>
        <label className={styles.label} htmlFor="feedback-contact">
          Contact (so we can follow up){" "}
          <span className={styles.optional}>Optional</span>
        </label>
        <input
          id="feedback-contact"
          className={styles.input}
          type="text"
          value={contact}
          maxLength={CONTACT_MAX}
          onChange={(e) => setContact(e.target.value)}
          placeholder="Email or phone number"
          autoComplete="email"
        />
      </div>

      <div className={styles.actions}>
        <button
          type="submit"
          className={styles.submit}
          disabled={status === "submitting" || message.trim().length === 0}
        >
          {status === "submitting" ? "Sending…" : "Send feedback"}
        </button>
      </div>
    </form>
  );
}
