"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteEvent } from "./actions";

/**
 * Delete button for a single event. Soft-deletes via the server action
 * (flips `deleted` so the event stays restorable, DEV-95) and asks for
 * confirmation first — deleting is always recoverable, so a plain confirm
 * is enough here.
 */
export default function DeleteEventButton({
  id,
  title,
}: {
  id: string;
  title: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!window.confirm(`Delete “${title}”? It can be restored later.`)) return;
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", id);
      await deleteEvent(formData);
      router.refresh();
    });
  }

  return (
    <button
      className="btn btn-reject"
      type="button"
      disabled={isPending}
      onClick={handleDelete}
    >
      {isPending ? "Deleting…" : "Delete"}
    </button>
  );
}
