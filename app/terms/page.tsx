import type { Metadata } from "next";
import styles from "./terms.module.css";

// ── App / church identity — CHANGE THESE BEFORE DEPLOYING ────────────────────
// These values drive the rendered terms. Update them to the church's real
// name and a real contact email, then deploy the backend. The page is
// intentionally static (no data fetching) so it renders anywhere, including
// the Vercel production deployment, without touching the database.
const APP_NAME = "Victory and Glory Center";
const CHURCH_NAME = "Victory and Glory Center";
const CONTACT_EMAIL = "victoryandglorycenter@gmail.com";
const EFFECTIVE_DATE = "August 20, 2026";
const LAST_UPDATED = "August 20, 2026";

export const metadata: Metadata = {
  title: `Terms of Service — ${APP_NAME} App`,
  description: `Terms of Service for the ${APP_NAME} mobile application and web dashboard`,
};

export default function TermsPage() {
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
          <h1 className={styles.title}>Terms of Service</h1>
          <p className={styles.effective}>
            {APP_NAME} Mobile Application &middot; Effective Date:{" "}
            {EFFECTIVE_DATE} &middot; Last updated: {LAST_UPDATED}
          </p>

          <section className={styles.section}>
            <h2>1. Acceptance of These Terms</h2>
            <p>
              These Terms of Service (&ldquo;Terms&rdquo;) govern your use of
              the {APP_NAME} mobile application (the &ldquo;App&rdquo;), the web
              dashboard used by approved church staff, and the supporting
              services provided by {CHURCH_NAME} (&ldquo;we,&rdquo;
              &ldquo;our,&rdquo; or &ldquo;us&rdquo;). By installing, accessing,
              or using the App, you agree to these Terms. If you do not agree,
              please do not use the App. These Terms are separate from, and
              should be read together with, our{" "}
              <a href="/privacy">Privacy Policy</a>.
            </p>
          </section>

          <section className={styles.section}>
            <h2>2. Using the App</h2>
            <p>
              The App is provided to help church members and visitors stay
              connected with the church, including the member directory, events
              and RSVPs, the prayer wall, posts and announcements, sermons and
              media, birthday reminders, and notifications. You agree to use the
              App only for lawful purposes and in a way that respects other
              users and the church community.
            </p>
          </section>

          <section className={styles.section}>
            <h2>3. Prayer Wall and User-Generated Content</h2>
            <p>
              The prayer wall lets you submit prayer requests and pray for
              requests shared by others. Because you may submit prayer requests
              to a public surface, you agree that when you post you will not
              submit content that:
            </p>
            <ul>
              <li>
                is unlawful, defamatory, harassing, threatening, or abusive;
              </li>
              <li>
                contains nudity, graphic or gratuitous violence, or sexual
                content;
              </li>
              <li>
                shares someone else&rsquo;s personal information without their
                consent (including other people&rsquo;s full names, addresses,
                or contact details);
              </li>
              <li>
                promotes hate, discrimination, or violence against a person or
                group; or
              </li>
              <li>
                impersonates another person or misrepresents your affiliation
                with the church.
              </li>
            </ul>
            <p>
              Content published by approved staff, such as posts, announcements,
              and events, is publicly visible to App users. You agree not to
              reproduce or redistribute such content except for your own
              personal, non-commercial use.
            </p>
          </section>

          <section className={styles.section}>
            <h2>4. Moderation, Reporting, and Blocking</h2>
            <p>
              We moderate the prayer wall and other user-generated content to
              keep the community safe. Any user can report a prayer request from
              within the App, and the report is reviewed by church staff and
              administrators. We may hide or remove content that violates these
              Terms, and we may take action against repeat or serious
              violations.
            </p>
            <p>
              Because prayer requests may be submitted anonymously and the
              public prayer wall does not use accounts, blocking is applied to
              the anonymous device identifier associated with content rather
              than to a user account (this is the DEV-29 moderation decision,
              also described in the <a href="/privacy">Privacy Policy</a>,
              Sections 3.2 and 5.4). A blocked device is prevented from
              submitting, reporting, or reacting to prayer requests. If you
              believe your device was blocked in error, please contact us using
              the details in Section 10.
            </p>
          </section>

          <section className={styles.section}>
            <h2>5. Staff and Administrator Accounts</h2>
            <p>
              The web dashboard and certain App features are available only to
              approved staff and administrator accounts. By requesting or
              accepting such an account, you agree to:
            </p>
            <ul>
              <li>
                keep your login credentials confidential and not share them with
                anyone else;
              </li>
              <li>
                use the dashboard only for legitimate church administration,
                including managing member records, events, posts, prayer-request
                moderation, and notifications;
              </li>
              <li>
                access member directory information and other personal
                information only as needed for your church role, and keep it
                confidential;
              </li>
              <li>
                follow the moderation standards described in Section 4 when
                reviewing reported content; and
              </li>
              <li>
                notify us immediately if you believe your account has been
                compromised.
              </li>
            </ul>
            <p>
              Accounts are approved by church administrators and may be
              suspended or revoked at any time for inactivity, suspected misuse,
              or violation of these Terms.
            </p>
          </section>

          <section className={styles.section}>
            <h2>6. Content You Submit</h2>
            <p>
              You retain ownership of the content you submit. By submitting
              content to the App, you grant us a non-exclusive, royalty-free
              license to host, store, and display that content so we can operate
              the App and provide its features. We do not sell or rent your
              content.
            </p>
          </section>

          <section className={styles.section}>
            <h2>7. Termination and Suspension</h2>
            <p>
              We may suspend or terminate access to the App, or to a specific
              feature, at any time, including if we reasonably believe you have
              violated these Terms. Where possible, we will provide notice and
              an opportunity to respond. You may stop using the App at any time.
            </p>
          </section>

          <section className={styles.section}>
            <h2>8. Disclaimers and Limitation of Liability</h2>
            <p>
              The App is provided &ldquo;as is&rdquo; and &ldquo;as
              available&rdquo; without warranties of any kind, whether express
              or implied, to the maximum extent permitted by law. To the fullest
              extent permitted by law, {CHURCH_NAME} will not be liable for
              indirect, incidental, special, consequential, or punitive damages
              arising out of or relating to your use of the App. Nothing in
              these Terms limits any liability that cannot be limited under
              applicable law.
            </p>
          </section>

          <section className={styles.section}>
            <h2>9. Changes to These Terms</h2>
            <p>
              We may update these Terms from time to time. When we do, we will
              revise the &ldquo;Last updated&rdquo; date at the top of this
              page. Material changes will be communicated through the App or by
              other appropriate means. Your continued use of the App after
              changes take effect constitutes acceptance of the updated Terms.
            </p>
          </section>

          <section className={styles.section}>
            <h2>10. Contact</h2>
            <p>
              If you have questions about these Terms, please contact us at{" "}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
            </p>
          </section>

          <footer className={styles.footer}>
            <p>
              <a href="/privacy">Privacy Policy</a> &middot; Terms of Service
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
