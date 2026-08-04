import { redirect } from "next/navigation";
import { requireApprovedSession } from "@/lib/session";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import { approveAccount, rejectAccount } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

function formatDate(d: string | Date | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", {
    dateStyle: "medium",
  });
}

function ActionButtons({ userId, status }: { userId: string; status: string }) {
  return (
    <div className="row-actions">
      {status !== "approved" && (
        <form action={approveAccount}>
          <input type="hidden" name="userId" value={userId} />
          <button className="btn btn-approve" type="submit">
            Approve
          </button>
        </form>
      )}
      {status !== "rejected" && (
        <form action={rejectAccount}>
          <input type="hidden" name="userId" value={userId} />
          <button className="btn btn-reject" type="submit">
            Reject
          </button>
        </form>
      )}
    </div>
  );
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const session = await requireApprovedSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/dashboard/activity");

  const status =
    typeof searchParams.status === "string" ? searchParams.status : "";

  await connectDB();
  const filter = status ? { status } : {};
  const users = await User.find(filter)
    .select("-passwordHash -resetToken -resetTokenExpiry")
    .sort({ createdAt: 1 })
    .lean();
  const pendingCount = await User.countDocuments({ status: "pending" });

  const tabs = [
    { key: "", label: "All" },
    { key: "pending", label: `Pending (${pendingCount})` },
    { key: "approved", label: "Approved" },
    { key: "rejected", label: "Rejected" },
  ];

  return (
    <div className="container">
      <h1 className="page-title">Users</h1>
      <p className="page-subtitle">
        Approve new accounts before they can use the app. Pending users only see
        a &ldquo;pending review&rdquo; screen on mobile until approved.
      </p>

      <div className="filter-tabs">
        {tabs.map((tab) => {
          const active = status === tab.key;
          const href =
            tab.key === ""
              ? "/dashboard/users"
              : `/dashboard/users?status=${tab.key}`;
          return (
            <a
              key={tab.key}
              href={href}
              className={active ? "filter-tab active" : "filter-tab"}
            >
              {tab.label}
            </a>
          );
        })}
      </div>

      <div className="card table-wrap">
        {users.length === 0 ? (
          <div className="empty-state">
            <h3>No users found</h3>
            <p>New sign-ups will appear here for approval.</p>
          </div>
        ) : (
          <table className="audit">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Registered</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u: any) => (
                <tr key={u._id.toString()}>
                  <td className="actor-cell">{u.fullName}</td>
                  <td>{u.email}</td>
                  <td>
                    <span className="actor-role">{u.role.toUpperCase()}</span>
                  </td>
                  <td>
                    <span className={`badge badge-user-${u.status}`}>
                      {STATUS_LABEL[u.status] || u.status}
                    </span>
                  </td>
                  <td className="time-cell">{formatDate(u.createdAt)}</td>
                  <td>
                    <ActionButtons
                      userId={u._id.toString()}
                      status={u.status}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
