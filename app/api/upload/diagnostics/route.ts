import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser, authFailureResponse } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { listRecentUploads } from "@/lib/cloudinary";

const WRITER_ROLES = ["admin", "staff"];

/**
 * GET /api/upload/diagnostics?minutes=60&resourceType=image&maxResults=100
 *
 * Admin/staff diagnostic: lists the most recent assets that actually landed in
 * the Cloudinary app upload folder (church-member-app), queried server-side.
 *
 * WHY this exists — the upload failure the tester sees happens client→Cloudinary
 * directly, a leg the backend never observes (the mobile client uploads the raw
 * file straight to Cloudinary; only a signature request and the later post
 * create touch our server). So from the server logs alone you could never tell
 * whether the file reached Cloudinary.
 *
 * Correlation recipe after a failed upload:
 *   1. Find the `upload_signature.requested/issued` lines (note the time).
 *   2. Call this endpoint (same window).
 *   3. If NO asset shows up right after the signature time → the direct upload
 *      to Cloudinary failed (network, Cloudinary rejecting the file, or the app
 *      died). Ask the tester for the exact on-screen error text, or check
 *      Cloudinary's Media Library / Reports for the attempt.
 *   4. If an asset DOES show up but no `post.create.requested/succeeded` line
 *      follows → the upload succeeded but the client never reported back
 *      (app crash / lost URL), i.e. failure downstream of Cloudinary.
 *   5. If `post.create.requested` appears but no `post.create.succeeded` →
 *      failure is in the server-side create (fully visible in logs).
 */
export async function GET(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return authFailureResponse(auth);
  }
  const actor = auth.user!;
  if (!WRITER_ROLES.includes(actor.role)) {
    logger.warn("upload.diagnostics.forbidden", {
      actor: actor.email,
      role: actor.role,
    });
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  }

  const sp = req.nextUrl.searchParams;
  const minutesRaw = Number(sp.get("minutes") ?? "60");
  const minutes =
    Number.isFinite(minutesRaw) && minutesRaw > 0 ? minutesRaw : 60;
  const resourceTypeRaw = sp.get("resourceType") ?? "image";
  const resourceType =
    resourceTypeRaw === "video" || resourceTypeRaw === "raw"
      ? resourceTypeRaw
      : "image";
  const maxResultsRaw = Number(sp.get("maxResults") ?? "100");
  const maxResults =
    Number.isFinite(maxResultsRaw) && maxResultsRaw > 0
      ? Math.min(Math.round(maxResultsRaw), 500)
      : 100;

  logger.info("upload.diagnostics.requested", {
    actor: actor.email,
    minutes,
    resourceType,
    maxResults,
  });

  try {
    const result = await listRecentUploads({
      minutes,
      resourceType,
      maxResults,
    });
    logger.info("upload.diagnostics.result", {
      actor: actor.email,
      minutes,
      resourceType,
      total: result.total,
      queriedAt: result.queriedAt,
      // Trimmed summary only — the full list goes back in the response body.
      uploads: result.uploads.map((u) => ({
        publicId: u.publicId,
        createdAt: u.createdAt,
        bytes: u.bytes,
        format: u.format,
      })),
    });

    return NextResponse.json({ success: true, data: result });
  } catch (err: any) {
    logger.error("upload.diagnostics.failed", {
      actor: actor.email,
      error: err?.message || "Internal error",
    });
    return NextResponse.json(
      { success: false, error: err?.message || "Diagnostics failed." },
      { status: 500 },
    );
  }
}
