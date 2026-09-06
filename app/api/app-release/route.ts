import {
  LATEST_APP_VERSION,
  APP_PACKAGE_NAME,
  PLAY_STORE_UPDATE_URL,
} from "@/lib/appRelease";

// GET /api/app-release
// Public, unauthenticated. Tells the mobile app the latest version published to
// the Play Store so Settings can surface an "Update available" row when the
// installed build is older (the app does the semver comparison client-side).
// No DB or auth involved; responses are CDN-cacheable.
export async function GET() {
  return Response.json(
    {
      latestVersion: LATEST_APP_VERSION,
      platform: "android",
      packageName: APP_PACKAGE_NAME,
      updateUrl: PLAY_STORE_UPDATE_URL,
    },
    {
      headers: {
        // Cache for 10 minutes at the edge + browsers so app cold-starts don't
        // each hit the origin function.
        "Cache-Control":
          "public, max-age=600, s-maxage=600, stale-while-revalidate=3600",
      },
    },
  );
}
