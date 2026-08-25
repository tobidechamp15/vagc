import { redirect } from "next/navigation";
import { requireApprovedSession } from "@/lib/session";
import { connectDB } from "@/lib/mongodb";
import Post from "@/models/Post";
import User from "@/models/User";

export const dynamic = "force-dynamic";

const MODERATOR_ROLES = ["admin", "staff"];

const TYPE_LABELS: Record<string, string> = {
  announcement: "Announcement",
  pastors_message: "Pastor's Message",
  sermon: "Sermon",
};

const TYPE_BADGES: Record<string, string> = {
  announcement: "badge-post-announcement",
  pastors_message: "badge-post-pastors",
  sermon: "badge-post-sermon",
};

function formatDate(d: string | Date | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function excerpt(text: string | undefined, n = 90): string {
  if (!text) return "—";
  return text.length > n ? `${text.slice(0, n)}…` : text;
}

/**
 * DEV-93 web dashboard — a read-only view of everything admins publish from
 * the mobile app: every post/upload with its type, author, and media status.
 * Sermons are flagged as having media uploaded (audio/video) or not, so the
 * team can see at a glance which sermons are missing their media.
 */
function MediaBadges({ post }: { post: any }) {
  return (
    <>
      {post.imageUrl ? (
        <span className="badge badge-post-image">Image</span>
      ) : null}
      {post.type === "sermon" ? (
        post.mediaUrl ? (
          <span
            className={
              post.mediaType === "video"
                ? "badge badge-post-video"
                : "badge badge-post-audio"
            }
          >
            {post.mediaType === "video" ? "Video" : "Audio"}
          </span>
        ) : (
          <span className="badge badge-post-nomedia">No media</span>
        )
      ) : null}
    </>
  );
}

export default async function PostsPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const session = await requireApprovedSession();
  if (!session) redirect("/login");
  if (!MODERATOR_ROLES.includes(session.role)) {
    redirect("/dashboard/activity");
  }

  const sp = (key: string) => {
    const v = searchParams[key];
    return typeof v === "string" ? v : "";
  };
  const status = sp("status");
  const q = sp("q").trim();

  await connectDB();

  const byType =
    status === "announcement" ||
    status === "pastors_message" ||
    status === "sermon"
      ? { type: status }
      : {};
  const byMedia =
    status === "with-media"
      ? { type: "sermon", mediaUrl: { $ne: null } }
      : status === "without-media"
        ? { type: "sermon", mediaUrl: null }
        : {};

  // Soft-deleted posts are hidden from the admin list too — DELETE on the API
  // only flips `deleted`, so restored posts reappear here automatically.
  const filter: Record<string, unknown> = {
    deleted: { $ne: true },
    ...byType,
    ...byMedia,
  };
  if (q) {
    filter.$or = [
      { title: { $regex: q, $options: "i" } },
      { body: { $regex: q, $options: "i" } },
    ];
  }

  const [
    posts,
    users,
    total,
    announcementCount,
    pastorsCount,
    sermonCount,
    withMediaCount,
    withoutMediaCount,
  ] = await Promise.all([
    Post.find(filter).sort({ publishedAt: -1 }).limit(100).lean(),
    User.find().select("_id fullName email").lean(),
    Post.countDocuments({ deleted: { $ne: true } }),
    Post.countDocuments({ deleted: { $ne: true }, type: "announcement" }),
    Post.countDocuments({ deleted: { $ne: true }, type: "pastors_message" }),
    Post.countDocuments({ deleted: { $ne: true }, type: "sermon" }),
    Post.countDocuments({
      deleted: { $ne: true },
      type: "sermon",
      mediaUrl: { $ne: null },
    }),
    Post.countDocuments({
      deleted: { $ne: true },
      type: "sermon",
      mediaUrl: null,
    }),
  ]);

  const userMap = new Map(users.map((u: any) => [String(u._id), u]));

  const tabs = [
    { key: "", label: `All (${total})` },
    { key: "announcement", label: `Announcements (${announcementCount})` },
    { key: "pastors_message", label: `Pastor's (${pastorsCount})` },
    { key: "sermon", label: `Sermons (${sermonCount})` },
    { key: "with-media", label: `With media (${withMediaCount})` },
    { key: "without-media", label: `No media (${withoutMediaCount})` },
  ];

  return (
    <div className="container">
      <h1 className="page-title">Posts</h1>
      <p className="page-subtitle">
        Every post published from the mobile app. Sermons are flagged with their
        media status so you can see which ones have audio/video uploaded and
        which are still missing it.
      </p>

      <div className="stats">
        <div className="stat">
          <div className="stat-label">Total posts</div>
          <div className="stat-value">{total}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Announcements</div>
          <div className="stat-value">{announcementCount}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Pastor's messages</div>
          <div className="stat-value">{pastorsCount}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Sermons</div>
          <div className="stat-value">{sermonCount}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Sermons w/ media</div>
          <div className="stat-value">{withMediaCount}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Sermons w/o media</div>
          <div className="stat-value">{withoutMediaCount}</div>
        </div>
      </div>

      <div className="filter-tabs">
        {tabs.map((tab) => {
          const active = status === tab.key;
          const href =
            tab.key === ""
              ? "/dashboard/posts"
              : `/dashboard/posts?status=${tab.key}`;
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

      <form className="filters" method="GET" action="/dashboard/posts">
        <div className="field">
          <label htmlFor="q">Search</label>
          <input
            id="q"
            name="q"
            type="text"
            defaultValue={q}
            placeholder="Search by title or message"
          />
        </div>
        {status && <input type="hidden" name="status" value={status} />}
        <button type="submit" className="btn btn-primary">
          Search
        </button>
        {(q || status) && (
          <a href="/dashboard/posts" className="btn btn-ghost">
            Reset
          </a>
        )}
      </form>

      <div className="card table-wrap">
        {posts.length === 0 ? (
          <div className="empty-state">
            <h3>No posts found</h3>
            <p>
              {status === "without-media"
                ? "Every sermon has media attached — nothing missing."
                : "Adjust the filter, or publish a post from the mobile app."}
            </p>
          </div>
        ) : (
          <table className="audit">
            <thead>
              <tr>
                <th>Type</th>
                <th>Title</th>
                <th>Author</th>
                <th>Media</th>
                <th>Amen</th>
                <th>Published</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((post: any) => {
                const author = userMap.get(String(post.authorId));
                return (
                  <tr key={post._id.toString()}>
                    <td>
                      <span className={`badge ${TYPE_BADGES[post.type] || ""}`}>
                        {TYPE_LABELS[post.type] || post.type}
                      </span>
                    </td>
                    <td style={{ maxWidth: 320 }}>
                      <div style={{ fontWeight: 600 }}>{post.title}</div>
                      <div style={{ color: "var(--text-muted)", fontSize: 12 }}>
                        {excerpt(post.body)}
                      </div>
                    </td>
                    <td className="actor-cell">
                      {author?.fullName || author?.email || "—"}
                    </td>
                    <td>
                      <MediaBadges post={post} />
                    </td>
                    <td>{post.reactionCount ?? 0}</td>
                    <td className="time-cell">
                      {formatDate(post.publishedAt)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
