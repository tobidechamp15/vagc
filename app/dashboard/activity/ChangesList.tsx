import type { ActivityLogItem } from "@/lib/activity";

export default function ChangesList({ item }: { item: ActivityLogItem }) {
  const changes = item.changes;
  if (!changes || Object.keys(changes).length === 0) {
    return <span className="muted">—</span>;
  }
  const entries = Object.entries(changes);
  return (
    <ul className="changes">
      {entries.map(([field, diff]) => (
        <li key={field}>
          <span className="field-name">{field}</span>:{" "}
          <span className="from">{String((diff as any)?.from ?? "")}</span> →{" "}
          <span className="to">{String((diff as any)?.to ?? "")}</span>
        </li>
      ))}
    </ul>
  );
}
