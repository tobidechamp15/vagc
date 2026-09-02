import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser, authFailureResponse } from "@/lib/auth";
import { logger } from "@/lib/logger";

// Only admin/staff (the same roles that can upload) may write trace entries,
// so the endpoint can't be used to spam the log stream with forged events.
const WRITER_ROLES = ["admin", "staff"];

// A fixed vocabulary of client-side events we know about. Anything else is
// dropped (with a warning) so the endpoint can't be used to inject arbitrary
// log lines.
const KNOWN_EVENTS = new Set([
  // Signature / task-building stage (mediaUpload.ts)
  "signature.requesting",
  "signature.received",
  "signature.invalid_response",
  "signature.error",
  "task.preparing",
  "task.built",
  // Native upload stage (task.uploadAsync)
  "upload.preparing",
  "upload.start",
  "upload.result",
  "upload.http_error",
  "upload.rejected",
  "upload.unparseable_body",
  "upload.parsed",
  "upload.error",
  // Post publish stage (backgroundUpload.ts runPipeline)
  "post.publish_start",
  "post.publish_done",
  "post.save_requested",
  "post.save_success",
  "post.save_error",
  "pipeline.error",
]);

/**
 * POST /api/upload/trace
 *
 * Diagnostic endpoint used by the mobile client (mobile/src/lib/uploadTrace.ts)
 * to forward per-checkpoint upload telemetry INTO the server log stream. The
 * direct client→Cloudinary leg of a DEV-17 upload never touches this backend,
 * so without this the server logs would only ever show `upload_signature.*` and
 * never reveal where the actual upload failed.
 *
 * Request body:
 *   {
 *     event: string,       // one of KNOWN_EVENTS
 *     uploadId?: string,   // correlation id for the whole upload attempt
 *     file?: { name?, size?, mimeType? },
 *     details?: object     // optional free-form metadata (sanitized below)
 *   }
 */
export async function POST(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return authFailureResponse(auth);
  }
  const actor = auth.user!;
  if (!WRITER_ROLES.includes(actor.role)) {
    logger.warn("upload_trace.forbidden", {
      actor: actor.email,
      role: actor.role,
    });
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const event = typeof body.event === "string" ? body.event : "";
    if (!KNOWN_EVENTS.has(event)) {
      logger.warn("upload_trace.unknown_event", {
        actor: actor.email,
        event: String(event).slice(0, 80),
      });
      return NextResponse.json(
        { success: false, error: "Unknown event." },
        { status: 400 },
      );
    }

    const uploadId =
      typeof body.uploadId === "string"
        ? body.uploadId.slice(0, 64)
        : undefined;

    const file =
      body.file && typeof body.file === "object"
        ? {
            name:
              typeof body.file.name === "string"
                ? body.file.name.slice(0, 255)
                : undefined,
            size:
              typeof body.file.size === "number" ? body.file.size : undefined,
            mimeType:
              typeof body.file.mimeType === "string"
                ? body.file.mimeType.slice(0, 120)
                : undefined,
          }
        : undefined;

    // Free-form details: only keep primitives and short strings/arrays so
    // nothing huge or structured is echoed verbatim into the log stream.
    const details = sanitizeDetails(body.details);

    logger.info(`upload_trace.${event}`, {
      actor: actor.email,
      role: actor.role,
      ...(uploadId ? { uploadId } : {}),
      ...(file && (file.name || file.size != null || file.mimeType)
        ? { file }
        : {}),
      ...(details ? { details } : {}),
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    logger.error("upload_trace.failed", {
      actor: actor.email,
      error: err?.message || "Internal error",
    });
    return NextResponse.json(
      { success: false, error: "Trace failed." },
      { status: 500 },
    );
  }
}

function sanitizeDetails(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (key.length > 40) continue;
    if (typeof val === "string") out[key] = val.slice(0, 500);
    else if (typeof val === "number") out[key] = val;
    else if (typeof val === "boolean") out[key] = val;
    else if (val === null || val === undefined) continue;
    else out[key] = JSON.stringify(val).slice(0, 500);
  }
  return Object.keys(out).length ? out : undefined;
}
