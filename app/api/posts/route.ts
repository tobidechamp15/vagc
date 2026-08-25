import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Post from "@/models/Post";
import { requireApprovedUser, authFailureResponse } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { logActivity, getRequestMeta } from "@/lib/activity";
import {
  getStreamingUrl,
  isPublicHttpUrl,
  optimizeImageUrl,
} from "@/lib/cloudinary";
import { sendPushNotification } from "@/lib/push";

// Users allowed to write posts. The User model only has admin/staff roles, so
// this matches the existing member-write gate (any approved account).
const WRITER_ROLES = ["admin", "staff"];

// GET /api/posts                     -> public feed (paginated, newest first)
// GET /api/posts?page=2&limit=10     -> paginate (page is 1-based, default limit 10)
// No auth middleware — this is a public endpoint.
export async function GET(req: NextRequest) {
  try {
    await connectDB();

    const page = Math.max(
      1,
      parseInt(req.nextUrl.searchParams.get("page") || "1", 10) || 1,
    );
    const limit = Math.min(
      100,
      Math.max(
        1,
        parseInt(req.nextUrl.searchParams.get("limit") || "10", 10) || 10,
      ),
    );

    // Soft-deleted posts are hidden from the public feed.
    const filter = { deleted: { $ne: true } };
    const [total, data] = await Promise.all([
      Post.countDocuments(filter),
      Post.find(filter)
        .sort({ publishedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    const start = (page - 1) * limit;
    return NextResponse.json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: start + data.length < total,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}

// POST /api/posts -> create a post (approved admin/staff only)
export async function POST(req: NextRequest) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return authFailureResponse(auth);
  }
  const actor = auth.user!;
  if (!WRITER_ROLES.includes(actor.role)) {
    logger.warn("post.create.forbidden", { actor: actor.email });
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  }
  // Hoisted so the catch block can log which type/title were being created.
  let type: unknown;
  let title: unknown;
  try {
    await connectDB();
    const body = await req.json();

    type = body.type;
    title = body.title;
    const { body: postBody, imageUrl, mediaUrl, mediaType } = body;

    // DEV-93 trace: if this appears but the create later fails validation, the
    // mobile client DID upload the file to Cloudinary and got a URL — the
    // failure is in the post payload, not the upload itself.
    logger.info("post.create.requested", {
      actor: actor.email,
      role: actor.role,
      type,
      hasImage: !!imageUrl,
      hasMedia: !!mediaUrl,
      mediaType,
    });

    if (!type || !title || !postBody) {
      logger.warn("post.create.rejected", {
        actor: actor.email,
        reason: "missing required fields",
        hasType: !!type,
        hasTitle: !!title,
        hasBody: !!postBody,
      });
      return NextResponse.json(
        { success: false, error: "type, title, and body are required" },
        { status: 400 },
      );
    }

    // imageUrl/mediaUrl come from direct-to-Cloudinary uploads (DEV-17): the
    // client uploads the file straight to Cloudinary and passes back the
    // returned secure_url here. Validate they are real public http(s) URLs so
    // we never persist junk.
    const mediaUrlFields = ["imageUrl", "mediaUrl"] as const;
    for (const field of mediaUrlFields) {
      const value: unknown = body[field];
      if (value != null && value !== "" && !isPublicHttpUrl(value)) {
        logger.warn("post.create.rejected", {
          actor: actor.email,
          reason: "invalid media URL",
          field,
          value: typeof value === "string" ? value.slice(0, 120) : value,
        });
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
    if (mediaUrl && !["audio", "video"].includes(mediaType)) {
      logger.warn("post.create.rejected", {
        actor: actor.email,
        reason: "mediaUrl set without a valid mediaType",
        mediaUrl: String(mediaUrl).slice(0, 120),
        mediaType,
      });
      return NextResponse.json(
        {
          success: false,
          error: "mediaType (audio or video) is required when mediaUrl is set",
        },
        { status: 400 },
      );
    }
    if (mediaType && !mediaUrl) {
      logger.warn("post.create.rejected", {
        actor: actor.email,
        reason: "mediaType set without mediaUrl",
        mediaType,
      });
      return NextResponse.json(
        {
          success: false,
          error: "mediaUrl is required when mediaType is set",
        },
        { status: 400 },
      );
    }

    // Sermon AUDIO/VIDEO is stored as an adaptive HLS (.m3u8) manifest so the
    // mobile app STREAMS it (expo-video) instead of progressively downloading
    // the whole file first. Playback starts after the first ~5s segment is
    // buffered and the download grows as the listener progresses. Audio is
    // uploaded under Cloudinary's video resource, so getStreamingUrl applies to
    // it too. Non-Cloudinary URLs and non-media types pass through untouched.
    const resolvedMediaUrl =
      (mediaType === "audio" || mediaType === "video") &&
      typeof mediaUrl === "string"
        ? getStreamingUrl(mediaUrl) || mediaUrl
        : mediaUrl;

    // Post cover images are Cloudinary assets: rewrite to the optimized
    // delivery URL (f_auto,q_auto) so they aren't served full-size/uncompressed.
    const resolvedImageUrl =
      typeof imageUrl === "string" && imageUrl
        ? optimizeImageUrl(imageUrl)
        : imageUrl;

    const post = await Post.create({
      type,
      title,
      body: postBody,
      imageUrl: resolvedImageUrl,
      mediaUrl: resolvedMediaUrl,
      mediaType,
      authorId: actor.userId,
      publishedAt: body.publishedAt ? new Date(body.publishedAt) : new Date(),
    });

    // Audit: who published this post.
    await logActivity({
      actor,
      action: "POST_CREATE",
      targetId: post._id.toString(),
      targetName: post.title,
      meta: getRequestMeta(req),
    });

    // DEV-93: fan a push notification out to every registered device when a new
    // post is published. Category "announcements" respects each user's
    // notification pref (default ON), so members who opted out aren't hit. A
    // scheduled post (publishedAt in the future) doesn't notify yet, and a push
    // failure must never fail the post create itself.
    const isScheduled =
      body.publishedAt && new Date(body.publishedAt).getTime() > Date.now();
    if (!isScheduled) {
      try {
        const typeLabel =
          post.type === "sermon"
            ? "Sermon"
            : post.type === "pastors_message"
              ? "Pastor's Message"
              : "Announcement";
        const pushBody =
          (typeof post.title === "string" && post.title.trim()) ||
          (typeof post.body === "string" ? post.body.trim().slice(0, 160) : "");
        await sendPushNotification({
          title: `New ${typeLabel}`,
          body: pushBody,
          category: "announcements",
          channelId: "default",
          data: { screen: "PostDetail", postId: post._id.toString() },
        });
      } catch (pushErr: any) {
        logger.warn("post.create.push_failed", {
          postId: post._id.toString(),
          error: pushErr.message,
        });
      }
    }

    logger.info("post.create.succeeded", {
      actor: actor.email,
      postId: post._id.toString(),
      type: post.type,
      title: post.title,
      imageUrl: post.imageUrl,
      mediaUrl: post.mediaUrl,
      mediaType: post.mediaType,
    });

    return NextResponse.json({ success: true, data: post }, { status: 201 });
  } catch (err: any) {
    logger.error("post.create.failed", {
      actor: actor.email,
      type,
      title,
      error: err.message,
      stack: err.stack,
    });
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}
