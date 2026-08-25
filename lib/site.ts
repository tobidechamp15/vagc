/**
 * Public base URL for the web app's static pages (privacy policy, terms of
 * service, robots.txt, sitemap.xml).
 *
 * The backend deploys to Vercel, which exposes `VERCEL_URL` /
 * `VERCEL_PROJECT_PRODUCTION_URL` at build time. Prefer an explicit
 * `NEXT_PUBLIC_BASE_URL` if the church sets one for a custom domain;
 * otherwise fall back to Vercel's production URL, then the per-deployment
 * URL, then a documented placeholder so local/CI builds never crash.
 */
export function getSiteBaseUrl(): string {
  const explicit =
    process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return stripTrailingSlash(explicit);

  const vercel =
    process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercel) return `https://${stripTrailingSlash(vercel)}`;

  // Placeholder only — set NEXT_PUBLIC_BASE_URL (or a Vercel URL) in
  // production so robots.txt / sitemap.xml point at the real domain.
  return "https://church-backend.vercel.app";
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
