import type { Metadata } from "next";
import styles from "./give.module.css";

// ── App / church identity — CHANGE THESE BEFORE DEPLOYING ────────────────────
// These values drive the rendered page. Update them to the church's real
// name and a real contact email, then deploy the backend. The page is
// intentionally static (no data fetching) so it renders anywhere, including
// the Vercel production deployment, without touching the database.
const APP_NAME = "Victory and Glory Center";
const CHURCH_NAME = "Victory and Glory Center";
const CONTACT_EMAIL = "victoryandglorycenter@gmail.com";
const LAST_UPDATED = "August 21, 2026";

export const metadata: Metadata = {
  title: `Giving — ${APP_NAME}`,
  description: `How to support ${APP_NAME} — giving options for members and visitors`,
};

/**
 * Public giving page (served at /give).
 *
 * The mobile app's "Give" button opens this page (see
 * mobile/src/screens/ProfileScreen.tsx), derived from the same backend base
 * URL the app already uses for its API. The app itself does NOT process
 * payments (see the privacy policy §3.3), so this page points members at the
 * church's giving channels. It is static and requires no auth, matching the
 * /privacy and /terms pages.
 */
export default function GivePage() {
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
          <h1 className={styles.title}>Giving</h1>
          <p className={styles.effective}>
            Thank you for supporting the work of {CHURCH_NAME}.
          </p>

          <section className={styles.section}>
            <h2>Ways to Give</h2>
            <p>
              Your gifts help the church serve the community. You can give in
              whichever way is most convenient for you:
            </p>
            <ul>
              <li>
                <strong>During our services</strong> — giving baskets and
                offering envelopes are available at every service.
              </li>
              <li>
                <strong>By contacting the church office</strong> — reach us at{" "}
                <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> for bank
                transfer details or to arrange a recurring gift.
              </li>
              <li>
                <strong>Online</strong> — if the church publishes a dedicated
                online giving page, a direct link will be added here.
              </li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2>Giving through the App</h2>
            <p>
              The {APP_NAME} app does not process payments. Giving reminders you
              may opt into are only notifications — the app never collects
              payment card or bank account information (see our{" "}
              <a href="/privacy">Privacy Policy</a>, Section 3.3).
            </p>
          </section>

          <section className={styles.section}>
            <h2>Contact</h2>
            <p>
              If you have questions about giving, or would like to update your
              giving, please contact us at{" "}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
            </p>
          </section>

          <footer className={styles.footer}>
            <p>
              <a href="/prayer-wall">Prayer Wall</a> &middot;{" "}
              <a href="/privacy">Privacy Policy</a> &middot;{" "}
              <a href="/terms">Terms of Service</a>
            </p>
            <p>
              &copy; {new Date().getFullYear()} {CHURCH_NAME}. All rights
              reserved.
            </p>
          </footer>
        </article>
      </div>
    </main>
  );
}
