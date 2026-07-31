import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Member from "@/models/Member";
import { getAuthUser } from "@/lib/auth";

// GET /api/members/:id
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!getAuthUser(req)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    await connectDB();
    const member = await Member.findById(params.id);
    if (!member) {
      return NextResponse.json({ success: false, error: "Member not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: member });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// PUT /api/members/:id
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  if (!getAuthUser(req)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    await connectDB();
    const body = await req.json();
    const member = await Member.findByIdAndUpdate(
      params.id,
      { $set: body },
      { new: true, runValidators: true }
    );
    if (!member) {
      return NextResponse.json({ success: false, error: "Member not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: member });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// DELETE /api/members/:id
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!getAuthUser(req)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    await connectDB();
    const member = await Member.findByIdAndDelete(params.id);
    if (!member) {
      return NextResponse.json({ success: false, error: "Member not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: member });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
