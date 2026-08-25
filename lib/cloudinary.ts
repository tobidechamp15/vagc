import { v2 as cloudinary } from "cloudinary";

/**
 * Media object storage for post images/audio/video (DEV-17).
 *
 * Upload flow — DIRECT, raw files never pass through a Vercel function:
 *   1. Admin client calls POST /api/upload/signature and receives
 *      { cloudName, apiKey, timestamp, folder, resourceType, signature }.
 *   2. The client POSTs the file bytes straight to Cloudinary:
 *        https://api.cloudinary.com/v1_1/<cloudName>/<resourceType>/upload
 *      (multipart: file + the signed params). No file bytes transit the
 *      serverless function, so the ~4.5MB Vercel body cap never applies.
 *   3. Cloudinary returns a CDN-backed secure_url. The client stores that URL
 *      in Post.imageUrl / Post.mediaUrl when creating/updating the post, and
 *      the mobile app renders/streams it directly.
 *
 * The API secret never leaves the backend — it is only used to compute the
 * upload signature here, which Cloudinary verifies on receipt.
 */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

/** Default folder inside the Cloudinary account where app uploads land. */
export const CLOUDINARY_UPLOAD_FOLDER =
  process.env.CLOUDINARY_UPLOAD_FOLDER || "church-member-app";

/** Resource types Cloudinary accepts at its upload endpoint. */
export const UPLOAD_RESOURCE_TYPES = [
  "image",
  "video",
  "audio",
  "raw",
  "auto",
] as const;
export type UploadResourceType = (typeof UPLOAD_RESOURCE_TYPES)[number];

/** Streaming profile Cloudinary uses to generate adaptive HLS (sp_auto). */
export const STREAMING_PROFILE = "sp_auto";

// Direct (non-chunked) uploads to Cloudinary's upload endpoint are capped at
// 100MB. Larger sermon video files must be uploaded in chunks of `chunk_size`
// bytes (the client streams the file and Cloudinary reassembles it). Cloudinary
// accepts 5MB–90MB chunks; 20MB is its default.
export const MAX_DIRECT_UPLOAD_BYTES = 100 * 1024 * 1024; // 100 MB
export const MIN_CHUNK_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const DEFAULT_CHUNK_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
export const MAX_CHUNK_SIZE_BYTES = 90 * 1024 * 1024; // 90 MB

export function isCloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET,
  );
}

export interface UploadSignature {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  resourceType: UploadResourceType;
  /** Present when chunked upload is requested (large video/audio). */
  chunkSize?: number;
  /** True when the upload should be chunked to exceed the 100MB direct cap. */
  chunked?: boolean;
  signature: string;
}

/**
 * Computes the params a client needs to upload a file DIRECTLY to Cloudinary.
 *
 * The signature is generated over the exact params the client will submit, so
 * Cloudinary can verify the request without the API secret ever leaving the
 * backend.
 *
 * For large sermon video (>100MB) pass `chunkSize` so the client streams the
 * file in chunks instead of one request. Cloudinary requires the chunk size to
 * be between 5MB and 90MB.
 */
export function getUploadSignature(options?: {
  folder?: string;
  resourceType?: UploadResourceType;
  publicId?: string;
  chunkSize?: number;
}): UploadSignature {
  if (!isCloudinaryConfigured()) {
    throw new Error(
      "Cloudinary is not configured (missing CLOUDINARY_* env vars)",
    );
  }

  const folder = options?.folder || CLOUDINARY_UPLOAD_FOLDER;
  const resourceType = options?.resourceType || "auto";
  const timestamp = Math.round(Date.now() / 1000);
  const chunkSize = options?.chunkSize;

  if (
    chunkSize != null &&
    (chunkSize < MIN_CHUNK_SIZE_BYTES || chunkSize > MAX_CHUNK_SIZE_BYTES)
  ) {
    throw new Error(
      `chunkSize must be between ${MIN_CHUNK_SIZE_BYTES} and ${MAX_CHUNK_SIZE_BYTES} bytes`,
    );
  }

  const paramsToSign: Record<string, string> = {
    timestamp: String(timestamp),
    folder,
  };
  if (options?.publicId) paramsToSign.public_id = options.publicId;
  if (chunkSize != null) paramsToSign.chunk_size = String(chunkSize);

  // Safe: isCloudinaryConfigured() above guarantees the secret is present.
  const apiSecret = process.env.CLOUDINARY_API_SECRET as string;
  const signature = cloudinary.utils.api_sign_request(paramsToSign, apiSecret);

  return {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME as string,
    apiKey: process.env.CLOUDINARY_API_KEY as string,
    timestamp,
    folder,
    resourceType,
    ...(chunkSize != null ? { chunkSize, chunked: true } : {}),
    signature,
  };
}

/**
 * Extracts the Cloudinary public_id (including folder prefix, minus the file
 * extension) from a secure_url, e.g.
 *   https://res.cloudinary.com/<cloud>/video/upload/v1/church-member-app/x.mp4
 *     -> "church-member-app/x"
 * Returns null for URLs that don't look like Cloudinary asset URLs.
 */
export function extractPublicId(url: string): string | null {
  const match = url.match(/\/v\d+\/(.+?)(?:\.[a-zA-Z0-9]{2,5})?$/);
  return match ? match[1] : null;
}

/**
 * True when the URL points at a Cloudinary-hosted asset (image, video, audio,
 * or raw) — i.e. it came back from a Cloudinary upload.
 */
export function isCloudinaryUrl(url: string): boolean {
  return /^https?:\/\/(?:res\.cloudinary\.com|.+\.cloudinary\.com)\//.test(url);
}

/**
 * True when the URL is a Cloudinary IMAGE asset (post/event cover photos).
 */
export function isCloudinaryImageUrl(url: string): boolean {
  return isCloudinaryUrl(url) && /\/image\/upload\//.test(url);
}

/**
 * Rewrites a Cloudinary IMAGE delivery URL to serve an automatically optimized
 * version — `f_auto,q_auto` makes Cloudinary deliver the best format (WebP /
 * AVIF where the client supports it) at an automatically chosen quality, so
 * uploaded photos/post images aren't served at full, uncompressed size.
 *
 * - Only Cloudinary `/image/upload/` URLs are touched; everything else passes
 *   through unchanged (including video/audio, which are served via HLS).
 * - Already-optimized URLs are left untouched (idempotent).
 *
 * Example:
 *   https://res.cloudinary.com/x/image/upload/v1/church-member-app/a.jpg
 *     -> https://res.cloudinary.com/x/image/upload/f_auto,q_auto/v1/church-member-app/a.jpg
 */
export function optimizeImageUrl(url: string): string {
  if (!isCloudinaryImageUrl(url)) return url;
  if (url.includes("/image/upload/f_auto")) return url;
  return url.replace("/image/upload/", "/image/upload/f_auto,q_auto/");
}

/**
 * True when the URL is a Cloudinary VIDEO asset (sermon media). Used to decide
 * whether mediaUrl can be upgraded to an adaptive HLS manifest.
 */
export function isCloudinaryVideoUrl(url: string): boolean {
  return isCloudinaryUrl(url) && /\/video\/upload\//.test(url);
}

/**
 * Builds an adaptive HLS (.m3u8) manifest URL for a Cloudinary video/audio
 * asset from its secure_url, using the `sp_auto` streaming profile. Cloudinary
 * transcodes and serves segments on the fly, so expo-video starts playing after
 * the first ~5s segment is buffered and downloads more as the listener
 * progresses, instead of pulling the whole file before playing. Audio is stored
 * under Cloudinary's video resource, so the same manifest applies to it.
 *
 * Returns null when the URL isn't a Cloudinary video/audio URL or the cloud
 * name is unset (callers should fall back to the original mediaUrl).
 */
export function getStreamingUrl(url: string): string | null {
  if (!isCloudinaryVideoUrl(url)) return null;
  const publicId = extractPublicId(url);
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  if (!publicId || !cloudName) return null;
  return `https://res.cloudinary.com/${cloudName}/video/upload/${STREAMING_PROFILE}/${publicId}.m3u8`;
}

/**
 * Deletes an uploaded asset. Useful for cleanup when a post/media is removed.
 * resourceType must match how the asset was uploaded (image|video|audio|raw).
 */
export async function deleteMedia(
  publicId: string,
  resourceType: UploadResourceType = "image",
): Promise<{ result: string }> {
  return cloudinary.uploader.destroy(publicId, {
    resource_type: resourceType,
  }) as Promise<{ result: string }>;
}

/**
 * True when the value is an absolute http(s) URL (e.g. a Cloudinary
 * secure_url). Used to validate imageUrl/mediaUrl before persisting them.
 */
export function isPublicHttpUrl(value: unknown): boolean {
  if (typeof value !== "string" || value.length === 0) return false;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
