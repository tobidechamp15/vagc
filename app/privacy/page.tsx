import type { Metadata } from "next";
import styles from "./privacy.module.css";

// ── App / church identity — CHANGE THESE BEFORE DEPLOYING ────────────────────
// These values drive the rendered policy. Update them to the church's real
// name and a real contact address/email, then deploy the backend. The page is
// intentionally static (no data fetching) so it renders anywhere, including
// the Vercel production deployment, without touching the database.
const APP_NAME = "Victory and Glory Center";
const CHURCH_NAME = "Victory and Glory Center";
const CONTACT_EMAIL = "victoryandglorycenter@gmail.com";
const EFFECTIVE_DATE = "August 20, 2026";
const LAST_UPDATED = "August 20, 2026";

export const metadata: Metadata = {
  title: `Privacy Policy — ${APP_NAME} App`,
  description: `Privacy Policy for the ${APP_NAME} mobile application`,
};

export default function PrivacyPage() {
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
          <h1 className={styles.title}>Privacy Policy</h1>
          <p className={styles.effective}>
            {APP_NAME} Mobile Application &middot; Effective Date:{" "}
            {EFFECTIVE_DATE} &middot; Last updated: {LAST_UPDATED}
          </p>

          <section className={styles.section}>
            <h2>1. Introduction</h2>
            <p>
              This Privacy Policy explains how {CHURCH_NAME} (&ldquo;we,&rdquo;
              &ldquo;our,&rdquo; or &ldquo;us&rdquo;) collects, uses, discloses,
              and protects personal information in connection with the{" "}
              {APP_NAME} mobile application (the &ldquo;App&rdquo;) and its
              supporting services (the backend service and the web dashboard
              used by church staff).
            </p>
            <p>
              By installing, accessing, or using the App, you agree to the
              practices described in this policy. This policy applies to all
              users of the App, including church members and visitors, and the
              approved staff and administrators who manage church content.
            </p>
          </section>

          <section className={styles.section}>
            <h2>2. Contact</h2>
            <p>
              If you have any questions about this Privacy Policy or our data
              practices, please contact us at{" "}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
            </p>
          </section>

          <section className={styles.section}>
            <h2>3. Information We Collect</h2>

            <h3>3.1 Information you provide directly</h3>
            <ul>
              <li>
                <strong>Account and profile information.</strong> When you
                create a staff or administrator account, we collect your full
                name, email address, and a password (stored as a secure hash).
                If you choose to complete your profile, we may also collect a
                preferred name, phone number, home address, date of birth,
                gender, marital status, membership details (such as
                &ldquo;member since,&rdquo; membership ID, and baptism
                information), church affiliation, and your notification
                preferences.
              </li>
              <li>
                <strong>
                  Member directory information (entered by approved
                  staff/administrators).
                </strong>{" "}
                Approved staff and administrators may enter and manage records
                on behalf of church members, which include the member&rsquo;s
                full name, phone number, home address, date of birth, and email
                address. These records are used to manage the church&rsquo;s
                membership directory and to send birthday emails.
              </li>
              <li>
                <strong>Content you submit.</strong>
                <ul>
                  <li>
                    <strong>Prayer requests:</strong> the message you submit
                    and, if you choose to include it, your name. You may submit
                    a prayer request anonymously by leaving the name blank. Each
                    submission is associated with an anonymous device identifier
                    (Section 3.2) so the church can review reported content and
                    block a device that repeatedly posts inappropriate requests.
                  </li>
                  <li>
                    <strong>Media:</strong> photos (for example, a profile
                    photo) and images attached to posts or events, as well as
                    sermon audio and video uploaded by staff.
                  </li>
                  <li>
                    <strong>Posts and announcements:</strong> content (title,
                    text, images, audio, and video) that approved staff publish.
                  </li>
                </ul>
              </li>
            </ul>

            <h3>3.2 Information we collect automatically</h3>
            <ul>
              <li>
                <strong>Device identifier.</strong> When you RSVP to an event,
                react to a post (&ldquo;Amen&rdquo;), tap &ldquo;praying for
                this&rdquo; on a prayer request, submit a prayer request, or
                report a prayer request, the App creates a random, anonymous
                device identifier that is stored securely on your device and
                sent to us. This identifier does not contain your name or other
                personal details; we use it to prevent double-counting (for
                example, so the same device cannot RSVP to the same event
                twice), to remember your reaction or prayer state, and to
                moderate content (Section 5.4) &mdash; for example, we may block
                a device that repeatedly posts inappropriate prayer requests.
                The same anonymous identifier may be sent to us when you
                register for push notifications.
              </li>
              <li>
                <strong>Push notification tokens.</strong> If you have an
                approved staff account and enable notifications, your device
                provides a push notification token (together with your device
                platform and the anonymous device identifier). We store this
                token so we can send you the notifications you have opted into.
                Push notifications are delivered through the Expo push service.
              </li>
              <li>
                <strong>Audit and activity logs.</strong> We keep records of
                administrative actions (such as creating, updating, or deleting
                member records, approving accounts, and publishing content).
                These records include the actor&rsquo;s name, email, and role,
                the action performed, the affected record, and standard request
                metadata such as IP address and browser or device information.
              </li>
              <li>
                <strong>Server and technical logs.</strong> Our hosting provider
                may log standard technical information, such as IP addresses and
                request metadata, for security and operational purposes.
              </li>
            </ul>

            <h3>3.3 Information we do NOT collect</h3>
            <ul>
              <li>Precise or approximate device location (GPS);</li>
              <li>Your device contacts, calendar, or SMS content;</li>
              <li>
                Payment card or other financial account information (giving
                reminders are only notification preferences &mdash; the App does
                not process payments);
              </li>
              <li>Health or fitness data;</li>
              <li>Purchase history;</li>
              <li>
                Advertising identifiers, and we do not use any third-party
                advertising or analytics SDKs.
              </li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2>4. How We Use Your Information</h2>
            <ul>
              <li>
                To operate and provide the App&rsquo;s features, including the
                member directory, events and RSVPs, prayer wall, posts and
                announcements, and media playback;
              </li>
              <li>
                To send you communications you have requested or that relate to
                the App, including birthday emails, password-reset emails, and
                push notifications based on your notification preferences;
              </li>
              <li>
                To moderate content, including reviewing user-reported prayer
                requests and hiding or removing inappropriate content, and to
                block devices that repeatedly post or report inappropriately
                (Section 5.4);
              </li>
              <li>
                To maintain security, prevent abuse (such as duplicate RSVPs),
                and keep audit records;
              </li>
              <li>To comply with legal obligations and enforce our rights.</li>
            </ul>
            <p>
              We do not use your information for advertising or for third-party
              marketing, and we do not sell or rent your personal information.
            </p>
          </section>

          <section className={styles.section}>
            <h2>5. How We Share Your Information</h2>
            <p>
              We share personal information only with service providers that
              help us operate the App, and as described below.
            </p>
            <h3>5.1 Service providers</h3>
            <ul>
              <li>
                <strong>MongoDB Atlas</strong> &mdash; database hosting where
                app data is stored;
              </li>
              <li>
                <strong>Vercel</strong> &mdash; hosting and execution of the
                backend service;
              </li>
              <li>
                <strong>Cloudinary</strong> &mdash; storage and delivery of
                media (photos, audio, and video) uploaded through the App;
              </li>
              <li>
                <strong>Expo (Expo Push service)</strong> &mdash; delivery of
                push notifications using your device&rsquo;s push token;
              </li>
              <li>
                <strong>Google (Gmail SMTP)</strong> &mdash; delivery of emails
                on our behalf, such as birthday and password-reset emails.
              </li>
            </ul>
            <p>
              These providers are authorized to process your information only to
              provide services to us and may not use it for their own purposes.
            </p>
            <h3>5.2 Public content</h3>
            <p>
              Prayer requests (name and message, unless submitted anonymously)
              and the member-name directory are visible to other users of the
              App. Content published by staff, such as posts, announcements, and
              events, is publicly visible to App users.
            </p>
            <h3>5.3 Legal compliance and safety</h3>
            <p>
              We may disclose information when required by law, regulation, or
              legal process, or when we believe it is necessary to protect the
              rights, property, or safety of the church, our users, or others.
            </p>
            <p>
              We do not share personal information with third parties for their
              own advertising or marketing purposes.
            </p>
            <h3>5.4 Reporting and blocking</h3>
            <p>
              Any user can report a prayer request from within the App; the
              report is reviewed by the church&rsquo;s staff and administrators.
              Because prayer requests may be submitted anonymously and the
              public prayer wall does not use accounts, content-moderation
              blocks are applied to the anonymous device identifier (Section
              3.2) associated with the content rather than to a user account. A
              blocked device is prevented from submitting, reporting, or
              reacting to prayer requests. If you believe your device was
              blocked in error, please contact us using the details in Section
              2.
            </p>
          </section>

          <section className={styles.section}>
            <h2>6. Data Retention</h2>
            <p>
              We retain personal information for as long as it is needed to
              operate the App and provide its features, or as required to comply
              with our legal obligations, resolve disputes, and enforce our
              agreements.
            </p>
            <ul>
              <li>
                Member directory records are retained while the member remains
                part of the church directory and are removed when the record is
                deleted;
              </li>
              <li>
                Prayer requests, posts, events, and related content are retained
                until removed or moderated;
              </li>
              <li>
                Audit and activity logs are retained for security and
                accountability purposes;
              </li>
              <li>
                Push notification tokens are removed when you log out, revoke
                notification permission, or uninstall the App, and are cleaned
                up when a token is no longer valid.
              </li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2>7. Data Security</h2>
            <p>We take reasonable measures to protect personal information:</p>
            <ul>
              <li>Passwords are hashed and never stored in plaintext;</li>
              <li>Data is transmitted over encrypted connections (HTTPS);</li>
              <li>
                Member directory personal information is only accessible to
                approved, authenticated staff and administrator accounts. The
                public directory returns only member names;
              </li>
              <li>
                Data at rest is protected by our database provider&rsquo;s
                security controls;
              </li>
              <li>
                Access to administrative functions is limited to approved
                accounts.
              </li>
            </ul>
            <p>
              No method of transmission or storage is completely secure, and we
              cannot guarantee absolute security.
            </p>
          </section>

          <section className={styles.section}>
            <h2>8. International Data Transfers</h2>
            <p>
              The App is operated from Nigeria. The service providers we use
              (for example, MongoDB Atlas, Vercel, Cloudinary, Google, and Expo)
              may process data in the United States and other countries. By
              using the App, you consent to the transfer and processing of your
              information as described in this policy.
            </p>
          </section>

          <section className={styles.section}>
            <h2>9. Your Rights and Choices</h2>
            <p>Depending on your location, you may have the right to:</p>
            <ul>
              <li>Access the personal information we hold about you;</li>
              <li>Correct inaccurate information;</li>
              <li>Delete your personal information;</li>
              <li>Restrict or object to certain processing; and</li>
              <li>
                Withdraw consent, for example by disabling push notifications or
                adjusting your notification preferences in the App.
              </li>
            </ul>
            <p>
              To exercise any of these rights, or to request deletion of a
              member record, please contact us using the details in Section 2.
              We will respond within a reasonable timeframe and in accordance
              with applicable law.
            </p>
          </section>

          <section className={styles.section}>
            <h2>10. Children&rsquo;s Privacy</h2>
            <p>
              The App is intended for members and visitors of the church and is
              not directed to children under the age of 13. We do not knowingly
              collect personal information from children under 13. If you
              believe we have inadvertently collected information from a child,
              please contact us, and we will take steps to delete it.
            </p>
          </section>

          <section className={styles.section}>
            <h2>11. Changes to This Privacy Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. When we do,
              we will revise the &ldquo;Last updated&rdquo; date at the top of
              this page. Material changes will be communicated through the App
              or by other appropriate means. Your continued use of the App after
              changes take effect constitutes acceptance of the updated policy.
            </p>
          </section>

          <section className={styles.section}>
            <h2>12. Contact Us</h2>
            <p>
              If you have questions, concerns, or requests regarding this
              Privacy Policy or our data practices, please contact us at{" "}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
            </p>
          </section>

          <footer className={styles.footer}>
            <p>
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
