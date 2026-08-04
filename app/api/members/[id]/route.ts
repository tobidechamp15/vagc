import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Member from "@/models/Member";
import { requireApprovedUser, authFailureResponse } from "@/lib/auth";
import { logActivity, diffFields, getRequestMeta } from "@/lib/activity";

// GET /api/members/:id
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return authFailureResponse(auth);
  }
  try {
    await connectDB();
    const member = await Member.findById(params.id);
    if (!member) {
      return NextResponse.json(
        { success: false, error: "Member not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true, data: member });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}

// PUT /api/members/:id
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return authFailureResponse(auth);
  }
  const actor = auth.user!;
  try {
    await connectDB();
    const body = await req.json();

    // Load the member BEFORE the update so we can audit exactly what changed.
    const before = await Member.findById(params.id);
    if (!before) {
      return NextResponse.json(
        { success: false, error: "Member not found" },
        { status: 404 },
      );
    }

    const member = await Member.findByIdAndUpdate(
      params.id,
      { $set: body },
      { new: true, runValidators: true },
    );
    if (!member) {
      return NextResponse.json(
        { success: false, error: "Member not found" },
        { status: 404 },
      );
    }

    const changes = diffFields(before.toObject(), member.toObject());

    // Audit: who edited this member and which fields changed.
    await logActivity({
      actor,
      action: "MEMBER_UPDATE",
      targetId: member._id.toString(),
      targetName: member.fullName,
      changes,
      meta: getRequestMeta(req),
    });

    return NextResponse.json({ success: true, data: member });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}

// DELETE /api/members/:id
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireApprovedUser(req);
  if (!auth.ok) {
    return authFailureResponse(auth);
  }
  const actor = auth.user!;
  try {
    await connectDB();
    const member = await Member.findByIdAndDelete(params.id);
    if (!member) {
      return NextResponse.json(
        { success: false, error: "Member not found" },
        { status: 404 },
      );
    }

    // Audit: who deleted this member.
    await logActivity({
      actor,
      action: "MEMBER_DELETE",
      targetId: params.id,
      targetName: member.fullName,
      meta: getRequestMeta(req),
    });

    return NextResponse.json({ success: true, data: member });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}
