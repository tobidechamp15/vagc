import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * The login page (`app/login/page.tsx`) is a client component ("use client"),
 * so it cannot export `metadata` itself. This server layout provides the
 * per-route meta title/description for /login instead — mirroring the pattern
 * the /privacy page uses with its own page-level metadata export.
 */
export const metadata: Metadata = {
  title: "Sign In — Church Admin Dashboard",
  description:
    "Sign in to the church admin dashboard to manage members, events, posts, announcements, and notifications.",
};

export default function LoginLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
