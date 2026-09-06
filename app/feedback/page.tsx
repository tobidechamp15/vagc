import type { Metadata } from "next";
import styles from "./feedback.module.css";
import FeedbackClient from "./FeedbackClient";

// ── App / church identity — keep in sync with the give page ─────────────────
const APP_NAME = "Victory and Glory Center";
const CHURCH_NAME = "Victory and Glory Center";
const CONTACT_EMAIL = "victoryandglorycenter@gmail.com";
const LAST_UPDATED = "September 6, 2026";

export const metadata: Metadata = {
  title: `Feedback — ${APP_NAME}`,
  description: `Share your feedback on the ${APP_NAME} app — rate your experience and tell us what we can improve.`,
};

/**
 * Public app-feedback page (served at /feedback).
 *
 * Mobile users open this page in their browser to drop feedback on the app
 * (rating + a note + optional contact). It POSTs to the SAME public
 * /api/support-tickets endpoint the in-app "Report a problem" flow uses, so
 * every submission lands in the existing Support Inbox (web dashboard +
 * mobile admin inbox) as an ordinary support ticket. Public, no auth — the
 * middleware only guards /dashboard/* and /login.
 *
 * Submissions are tracked by the same anonymous browser device id as the
 * prayer wall (lib/webDeviceId.ts) and are rate-limited per IP by the API.
 */
export default function FeedbackPage() {
  return (
    <main className={styles.wrap}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.brandBadge}>VG</span>
          <span>{APP_NAME}</span>
        </div>
        <span className={styles.updated}>Last updated: {LAST_UPDATED}</span>
      </header>

      <div className={styles.container}>
        <article className={styles.card}>
          <h1 className={styles.title}>Feedback</h1>
          <p className={styles.effective}>
            Help us make the {APP_NAME} app better for you.
          </p>

          <div className={styles.highlight}>
            <strong>Your feedback goes straight to our team.</strong> Whether
            it's praise, a bug, or an idea, we read every message and use it to
            improve the app.
          </div>

          <FeedbackClient />

          <section className={styles.section}>
            <h2>Prefer email?</h2>
            <p>
              You can also reach us directly at{" "}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
            </p>
          </section>
        </article>

        <footer className={styles.footer}>
          <p>
            <a href="/prayer-wall">Prayer Wall</a> &middot;{" "}
            <a href="/give">Giving</a> &middot;{" "}
            <a href="/privacy">Privacy Policy</a> &middot;{" "}
            <a href="/terms">Terms of Service</a>
          </p>
          <p>
            &copy; {new Date().getFullYear()} {CHURCH_NAME}. All rights
            reserved.
          </p>
        </footer>
      </div>
    </main>
  );
}
