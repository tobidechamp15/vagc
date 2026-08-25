import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Post from "@/models/Post";
import { requireApprovedUser, authFailureResponse } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { logActivity, diffFields, getRequestMeta } from "@/lib/activity";
import {
  getStreamingUrl,
  isPublicHttpUrl,
  optimizeImageUrl,
} from "@/lib/cloudinary";
import { sendPushNotification } from "@/lib/push";

// Users allowed to write posts. The User model only has admin/staff roles, so
// this matches the existing member-write gate (any approved account).
const WRITER_ROLES = ["admin", "staff"];

// GET /api/posts/:id -> public single post (no auth middleware)
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    await connectDB();
    // Soft-deleted posts are treated as 404 so they never leak publicly.
    const post = await Post.findOne({ _id: params.id, deleted: { $ne: true } });
    if (!post) {
      return NextResponse.json(
        { success: false, error: "Post not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true, data: post });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}

// PUT /api/posts/:id -> update a post (approved admin/staff only)
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return authFailureResponse(auth);
  }
  const actor = auth.user!;
  if (!WRITER_ROLES.includes(actor.role)) {
    logger.warn("post.update.forbidden", { actor: actor.email });
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  }
  try {
    await connectDB();
    const body = await req.json();

    logger.info("post.update.requested", {
      actor: actor.email,
      postId: params.id,
      hasImage: !!body.imageUrl,
      hasMedia: !!body.mediaUrl,
      mediaType: body.mediaType,
    });

    // imageUrl/mediaUrl come from direct-to-Cloudinary uploads (DEV-17): the
    // client uploads the file straight to Cloudinary and passes back the
    // returned secure_url here. Validate they are real public http(s) URLs so
    // we never persist junk.
    const mediaUrlFields = ["imageUrl", "mediaUrl"] as const;
    for (const field of mediaUrlFields) {
      const value: unknown = (body as Record<string, unknown>)[field];
      if (value != null && value !== "" && !isPublicHttpUrl(value)) {
        return NextResponse.json(
          {
            success: false,
            error: `${field} must be a valid http(s) public URL`,
          },
          { status: 400 },
        );
      }
    }

    // A sermon audio/video attachment must carry a matching mediaType so the
    // mobile player knows whether to render an audio or video stream.
    const patchBody = body as Record<string, unknown>;
    const mediaUrl = patchBody.mediaUrl;
    const mediaType = patchBody.mediaType;
    if (
      mediaUrl &&
      mediaType &&
      !["audio", "video"].includes(mediaType as string)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "mediaType must be audio or video",
        },
        { status: 400 },
      );
    }

    // Sermon AUDIO/VIDEO is stored as an adaptive HLS (.m3u8) manifest so the
    // mobile app STREAMS it (expo-video) instead of progressively downloading
    // the whole file first — playback starts after the first ~5s segment is
    // buffered and the download grows as the listener progresses. Audio is
    // uploaded under Cloudinary's video resource, so getStreamingUrl applies to
    // it too. Non-Cloudinary URLs and non-media types pass through untouched.
    if (
      (mediaType === "audio" || mediaType === "video") &&
      typeof mediaUrl === "string"
    ) {
      patchBody.mediaUrl = getStreamingUrl(mediaUrl) || mediaUrl;
    }

    // Post cover images are Cloudinary assets: rewrite to the optimized
    // delivery URL (f_auto,q_auto) so they aren't served full-size/uncompressed.
    if (
      typeof patchBody.imageUrl === "string" &&
      (patchBody.imageUrl as string) !== ""
    ) {
      patchBody.imageUrl = optimizeImageUrl(patchBody.imageUrl as string);
    }

    // Load the post BEFORE the update so we can audit exactly what changed.
    const before = await Post.findById(params.id);
    if (!before) {
      logger.warn("post.update.not_found", {
        actor: actor.email,
        postId: params.id,
      });
      return NextResponse.json(
        { success: false, error: "Post not found" },
        { status: 404 },
      );
    }

    const post = await Post.findByIdAndUpdate(
      params.id,
      { $set: body },
      { new: true, runValidators: true },
    );
    if (!post) {
      return NextResponse.json(
        { success: false, error: "Post not found" },
        { status: 404 },
      );
    }

    const changes = diffFields(before.toObject(), post.toObject());

    // Audit: who edited this post and which fields changed.
    await logActivity({
      actor,
      action: "POST_UPDATE",
      targetId: post._id.toString(),
      targetName: post.title,
      changes,
      meta: getRequestMeta(req),
    });

    // DEV-93: when a post is edited, let members know — "changes have been made
    // ... check it out". Category "announcements" respects each user's
    // notification pref (default ON). A push failure must never fail the
    // update itself.
    try {
      const titleText =
        typeof post.title === "string" && post.title.trim()
          ? post.title.trim()
          : "this post";
      await sendPushNotification({
        title: "Post Updated",
        body: `Changes have been made to "${titleText}" — check it out!`,
        category: "announcements",
        channelId: "default",
        data: { screen: "PostDetail", postId: post._id.toString() },
      });
    } catch (pushErr: any) {
      logger.warn("post.update.push_failed", {
        postId: post._id.toString(),
        error: pushErr.message,
      });
    }

    logger.info("post.update.succeeded", {
      actor: actor.email,
      postId: post._id.toString(),
      title: post.title,
      changedFields: Object.keys(changes),
    });

    return NextResponse.json({ success: true, data: post });
  } catch (err: any) {
    logger.error("post.update.failed", {
      actor: actor.email,
      postId: params.id,
      error: err.message,
      stack: err.stack,
    });
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}

// DELETE /api/posts/:id -> delete a post (approved admin/staff only)
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return authFailureResponse(auth);
  }
  const actor = auth.user!;
  if (!WRITER_ROLES.includes(actor.role)) {
    logger.warn("post.delete.forbidden", { actor: actor.email });
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  }
  try {
    await connectDB();

    logger.info("post.delete.requested", {
      actor: actor.email,
      postId: params.id,
    });

    // Soft delete: flip the flag so the document stays in the DB (restorable)
    // but drops out of every public/admin list and detail view immediately.
    const post = await Post.findByIdAndUpdate(
      params.id,
      {
        $set: {
          deleted: true,
          deletedAt: new Date(),
          deletedBy: actor.userId,
        },
      },
      { new: true },
    );
    if (!post) {
      logger.warn("post.delete.not_found", {
        actor: actor.email,
        postId: params.id,
      });
      return NextResponse.json(
        { success: false, error: "Post not found" },
        { status: 404 },
      );
    }

    // Audit: who deleted this post.
    await logActivity({
      actor,
      action: "POST_DELETE",
      targetId: params.id,
      targetName: post.title,
      meta: getRequestMeta(req),
    });

    logger.info("post.delete.succeeded", {
      actor: actor.email,
      postId: params.id,
      title: post.title,
    });

    return NextResponse.json({ success: true, data: post });
  } catch (err: any) {
    logger.error("post.delete.failed", {
      actor: actor.email,
      postId: params.id,
      error: err.message,
      stack: err.stack,
    });
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}
