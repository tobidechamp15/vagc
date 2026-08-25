import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Post from "@/models/Post";
import { requireApprovedUser, authFailureResponse } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { logActivity, getRequestMeta } from "@/lib/activity";

// Users allowed to write/restore posts. Matches the post write gate.
const WRITER_ROLES = ["admin", "staff"];

// POST /api/posts/:id/restore -> restore a soft-deleted post
// (approved admin/staff only). DELETE now only flips `deleted`, so this brings
// the post back exactly as it was and removes it from the deleted set.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return authFailureResponse(auth);
  }
  const actor = auth.user!;
  if (!WRITER_ROLES.includes(actor.role)) {
    logger.warn("post.restore.forbidden", { actor: actor.email });
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  }
  try {
    await connectDB();

    logger.info("post.restore.requested", {
      actor: actor.email,
      postId: params.id,
    });

    // Clear the deleted flag + who/when it was hidden. Restoring an already
    // live post is a harmless no-op, so this is idempotent.
    const post = await Post.findByIdAndUpdate(
      params.id,
      {
        $set: {
          deleted: false,
          deletedAt: null,
          deletedBy: null,
        },
      },
      { new: true, runValidators: true },
    );
    if (!post) {
      logger.warn("post.restore.not_found", {
        actor: actor.email,
        postId: params.id,
      });
      return NextResponse.json(
        { success: false, error: "Post not found" },
        { status: 404 },
      );
    }

    // Audit: who restored this post and when.
    await logActivity({
      actor,
      action: "POST_RESTORE",
      targetId: post._id.toString(),
      targetName: post.title,
      meta: getRequestMeta(req),
    });

    logger.info("post.restore.succeeded", {
      actor: actor.email,
      postId: post._id.toString(),
      title: post.title,
    });

    return NextResponse.json({ success: true, data: post });
  } catch (err: any) {
    logger.error("post.restore.failed", {
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
