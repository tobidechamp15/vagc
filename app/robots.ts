import type { MetadataRoute } from "next";
import { getSiteBaseUrl } from "@/lib/site";

/**
 * robots.txt (Next.js App Router metadata route).
 *
 * The dashboard (/dashboard/*) and all API routes are private — they must not
 * be indexed. Only the static public pages (/privacy, /terms) and /login are
 * crawlable.
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl = getSiteBaseUrl();

  return {
    rules: {
      userAgent: "*",
      allow: ["/privacy", "/terms", "/give"],
      disallow: ["/dashboard", "/api/"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
