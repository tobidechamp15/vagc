import { redirect } from "next/navigation";
import { requireApprovedSession } from "@/lib/session";
import { connectDB } from "@/lib/mongodb";
import Event from "@/models/Event";
import EventForm from "../EventForm";

export const dynamic = "force-dynamic";

// Same moderation gate as the events list + the other management dashboards.
const MODERATOR_ROLES = ["admin", "staff"];

/**
 * Create (/dashboard/events/new) and edit (/dashboard/events/:id) share one
 * page. The EventForm client component handles the DEV-17 signed image upload
 * and submits through the gated server actions.
 */
export default async function EventEditorPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await requireApprovedSession();
  if (!session) redirect("/login");
  if (!MODERATOR_ROLES.includes(session.role)) {
    redirect("/dashboard/activity");
  }

  const creating = params.id === "new";

  let event: {
    _id: string;
    title: string;
    description: string;
    location: string;
    startsAt: string | null;
    endsAt: string | null;
    imageUrl: string | null;
  } | null = null;

  if (!creating) {
    await connectDB();
    const doc: any = await Event.findById(params.id).lean();
    if (!doc) redirect("/dashboard/events");
    event = {
      _id: doc._id.toString(),
      title: doc.title,
      description: doc.description || "",
      location: doc.location || "",
      startsAt: doc.startsAt ? doc.startsAt.toISOString() : null,
      endsAt: doc.endsAt ? doc.endsAt.toISOString() : null,
      imageUrl: doc.imageUrl || null,
    };
  }

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {creating ? "New event" : "Edit event"}
          </h1>
          <p className="page-subtitle">
            {creating
              ? "Create an event — it appears in the mobile app's public events list immediately."
              : "Update the event details. Changes reflect in the mobile app right away."}
          </p>
        </div>
      </div>

      <div className="card card-pad">
        <EventForm event={event} />
      </div>
    </div>
  );
}
