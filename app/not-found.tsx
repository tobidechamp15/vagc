import type { Metadata } from "next";
import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import styles from "./not-found.module.css";

export const metadata: Metadata = {
  title: "Page Not Found — Church Admin Dashboard",
  description: "The page you were looking for could not be found.",
};

/**
 * Custom 404 for the Next.js app (App Router `not-found`).
 *
 * Rendered for any unmatched route — including unmatched /dashboard/*
 * routes (for signed-in users) and unmatched public routes. The back link
 * adapts to auth state: signed-in users go to /dashboard, everyone else is
 * sent to /login. This page intentionally stays static (no data fetching).
 */
export default function NotFound() {
  const session = getSessionUser();
  const backHref = session ? "/dashboard" : "/login";
  const backLabel = session ? "Back to dashboard" : "Back to sign in";

  return (
    <main className={styles.wrap}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.brandBadge}>VG</span>
          <span>Victory and Glory Center</span>
        </div>
      </header>

      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.code}>404</div>
          <h1 className={styles.title}>Page not found</h1>
          <p className={styles.message}>
            The page you were looking for doesn&rsquo;t exist or has been moved.
          </p>
          <Link href={backHref} className={styles.link}>
            {backLabel} &rarr;
          </Link>
        </div>
      </div>

      <footer className={styles.footer}>
        &copy; {new Date().getFullYear()} Victory and Glory Center. All rights
        reserved.
      </footer>
    </main>
  );
}
