import type { Metadata } from "next";
import PrayerWallClient from "./PrayerWallClient";

export const metadata: Metadata = {
  title: "Prayer Wall",
  description:
    "Share a prayer request with the church community and pray for the requests of others.",
};

/**
 * Public prayer wall (served at /prayer-wall).
 *
 * Mirrors the prayer wall in the mobile app (mobile/src/screens/
 * PrayerWallScreen.tsx) so members on the web can submit, pray for, and report
 * requests through the same backend API. Public, no auth — the middleware only
 * guards /dashboard/* and /login, so this route is open.
 *
 * Device moderation (DEV-29) applies here too: the client persists an
 * anonymous browser device id (lib/webDeviceId.ts) and sends it with every
 * action, so a device blocked by admin/staff is rejected with 403 exactly as
 * in the app. See privacy/ugc-reporting-blocking.md.
 */
export default function PrayerWallPage() {
  return <PrayerWallClient />;
}
