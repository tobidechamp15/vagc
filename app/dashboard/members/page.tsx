import { connectDB } from "@/lib/mongodb";
import Member from "@/models/Member";
import { sortByUpcomingBirthday } from "@/lib/birthdaySort";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  sent: "Sent",
  failed: "Failed",
};

function formatDate(d: string | Date | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", {
    dateStyle: "medium",
  });
}

export default async function MembersPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const q = typeof searchParams.q === "string" ? searchParams.q.trim() : "";

  await connectDB();
  const filter = q
    ? {
        $or: [
          { fullName: { $regex: q, $options: "i" } },
          { gmail: { $regex: q, $options: "i" } },
          { phoneNumber: { $regex: q, $options: "i" } },
        ],
      }
    : {};

  // Order members by their closest upcoming birthday (today's first).
  const members = sortByUpcomingBirthday(await Member.find(filter).lean());
  const today = new Date();
  const birthdayCount = await Member.countDocuments({
    $expr: {
      $eq: [
        { $substrCP: ["$dateOfBirth", 5, 5] },
        `${String(today.getMonth() + 1).padStart(2, "0")}-${String(
          today.getDate(),
        ).padStart(2, "0")}`,
      ],
    },
  });

  return (
    <div className="container">
      <h1 className="page-title">Members</h1>
      <p className="page-subtitle">
        {members.length} member{members.length === 1 ? "" : "s"} ·{" "}
        {birthdayCount} birthday today
      </p>

      <form className="filters" method="GET" action="/dashboard/members">
        <div className="field">
          <label htmlFor="q">Search</label>
          <input
            id="q"
            name="q"
            type="text"
            defaultValue={q}
            placeholder="Name, email or phone"
          />
        </div>
        <button type="submit" className="btn btn-primary">
          Search
        </button>
        {q && (
          <a href="/dashboard/members" className="btn btn-ghost">
            Clear
          </a>
        )}
      </form>

      <div className="card table-wrap">
        {members.length === 0 ? (
          <div className="empty-state">
            <h3>No members found</h3>
            <p>
              {q
                ? "Try a different search term."
                : "Members are added from the mobile app."}
            </p>
          </div>
        ) : (
          <table className="audit">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Address</th>
                <th>Birthday</th>
                <th>Birthday email</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m: any) => (
                <tr key={m._id.toString()}>
                  <td className="actor-cell">{m.fullName}</td>
                  <td>{m.phoneNumber}</td>
                  <td>{m.gmail}</td>
                  <td>{m.address}</td>
                  <td className="time-cell">{formatDate(m.dateOfBirth)}</td>
                  <td>
                    <span
                      className={`badge badge-${m.birthdayStatus || "pending"}`}
                    >
                      {STATUS_LABEL[m.birthdayStatus || "pending"]}
                    </span>
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
