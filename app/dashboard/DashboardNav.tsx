"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/dashboard/activity", label: "Activity" },
  { href: "/dashboard/members", label: "Members" },
  { href: "/dashboard/users", label: "Users" },
];

export default function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav className="sidebar-nav">
      {LINKS.map((link) => {
        const active =
          pathname === link.href || pathname.startsWith(link.href + "/");
        return (
          <Link
            key={link.href}
            href={link.href}
            className={active ? "nav-link active" : "nav-link"}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
