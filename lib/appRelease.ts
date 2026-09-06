/**
 * Latest published mobile release — the single source of truth the app's
 * "Update available" check compares against.
 *
 * KEEP THIS IN SYNC ON EVERY RELEASE:
 *   1. Bump `version` in mobile/app.config.js
 *   2. Bump LATEST_APP_VERSION below to the SAME value
 *   3. Build + upload to Play Console (see plans/release-runbook.md)
 *
 * Optional override: setting the LATEST_APP_VERSION env var in Vercel wins over
 * the constant below, so you can bump the "latest" without a code deploy (the
 * constant is then just the fallback while the env var is unset).
 */
export const LATEST_APP_VERSION: string =
  process.env.LATEST_APP_VERSION || "1.0.1";

/** Android applicationId (must match the `package` in mobile/app.config.js). */
export const APP_PACKAGE_NAME = "com.victoryandglorycenter.app";

/** Where a user goes to install/update the app (Google Play listing). */
export const PLAY_STORE_UPDATE_URL = `https://play.google.com/store/apps/details?id=${APP_PACKAGE_NAME}`;
