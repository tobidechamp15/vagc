import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requireApprovedSession } from "@/lib/session";
import DashboardNav from "./DashboardNav";
import LogoutButton from "./LogoutButton";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await requireApprovedSession();
  if (!session) {
    redirect("/login");
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-badge">⛪</span>
          <span>Church Admin</span>
        </div>

        <DashboardNav />

        <div className="sidebar-user">
          <div className="sidebar-user-name">
            {session.name || session.email}
          </div>
          <div className="sidebar-user-role">
            {(session.role || "admin").toUpperCase()}
          </div>
          <LogoutButton />
        </div>
      </aside>

      <main className="shell-main">{children}</main>
    </div>
  );
}
