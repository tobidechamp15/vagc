import { NextRequest, NextResponse } from "next/server";
import { requireApprovedUser, authFailureResponse } from "@/lib/auth";
import { logger } from "@/lib/logger";
import {
  getUploadSignature,
  isCloudinaryConfigured,
  UPLOAD_RESOURCE_TYPES,
  type UploadResourceType,
} from "@/lib/cloudinary";

// Users allowed to write posts (and therefore upload media for them).
const WRITER_ROLES = ["admin", "staff"];

/**
 * POST /api/upload/signature
 *
 * Returns signed params for a DIRECT upload to Cloudinary (DEV-17). The admin
 * client uses these to POST the file bytes straight to Cloudinary's upload
 * endpoint — the raw file never transits or persists inside a Vercel function,
 * so the serverless ~4.5MB request-body cap does not apply to sermon audio
 * or video.
 *
 * Request body (optional):
 *   {
 *     resourceType?: "image" | "video" | "audio" | "raw" | "auto",
 *     chunkSize?: number   // bytes; required for video >100MB (5MB–90MB chunk).
 *   }
 *
 * Response data:
 *   { cloudName, apiKey, timestamp, folder, resourceType, signature,
 *     chunkSize?, chunked? }
 * The client then uploads to:
 *   https://api.cloudinary.com/v1_1/<cloudName>/<resourceType>/upload
 * When `chunked` is true the client must use a chunked upload with the returned
 * chunkSize (Cloudinary reassembles the parts).
 */
export async function POST(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return authFailureResponse(auth);
  }
  const actor = auth.user!;
  if (!WRITER_ROLES.includes(actor.role)) {
    logger.warn("upload_signature.forbidden", {
      actor: actor.email,
      role: actor.role,
    });
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  }

  if (!isCloudinaryConfigured()) {
    logger.error("upload_signature.cloudinary_unconfigured", {
      actor: actor.email,
    });
    return NextResponse.json(
      {
        success: false,
        error:
          "Cloudinary is not configured on the server (missing CLOUDINARY_* env vars).",
      },
      { status: 503 },
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const resourceType = (body.resourceType || "auto") as UploadResourceType;
    if (!UPLOAD_RESOURCE_TYPES.includes(resourceType)) {
      logger.warn("upload_signature.invalid_resource_type", {
        actor: actor.email,
        resourceType,
      });
      return NextResponse.json(
        {
          success: false,
          error: `resourceType must be one of: ${UPLOAD_RESOURCE_TYPES.join(", ")}`,
        },
        { status: 400 },
      );
    }

    const chunkSize =
      body.chunkSize != null ? Number(body.chunkSize) : undefined;

    // DEV-93 trace: the FIRST backend touchpoint of a media upload. If this
    // line never appears, the failure is client-side before the app even
    // requested a signature (auth token expired, offline, or the composer's
    // task-build step threw).
    logger.info("upload_signature.requested", {
      actor: actor.email,
      role: actor.role,
      resourceType,
      chunkSize,
    });

    const data = getUploadSignature({ resourceType, chunkSize });

    logger.info("upload_signature.issued", {
      actor: actor.email,
      resourceType,
      folder: data.folder,
      chunked: data.chunked ?? false,
    });

    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    // Validation failures (e.g. chunkSize out of range) surface here as 500;
    // keep them 400 for clarity to the calling client.
    const msg: string = err?.message || "Internal error";
    const isValidation =
      typeof msg === "string" && msg.includes("chunkSize must be between");
    logger.error("upload_signature.failed", {
      actor: actor.email,
      error: msg,
      status: isValidation ? 400 : 500,
    });
    return NextResponse.json(
      { success: false, error: msg },
      { status: isValidation ? 400 : 500 },
    );
  }
}
