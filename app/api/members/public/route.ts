import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Member from "@/models/Member";

// GET /api/members/public
// Public member directory — NO auth middleware. Anonymous visitors may call this.
//
// The field restriction happens inside the Mongoose query via `.select()`, so
// only the minimal display fields are ever read from the DB and sent to the
// client. phoneNumber, address, dateOfBirth, gmail, and the birthday-email
// bookkeeping fields never leave the server.
//
// This is a fully separate route from /api/members on purpose: a future change
// to the authenticated handler can never accidentally leak into this one, and
// there is no "public mode" toggle to flip.
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
        parseInt(req.nextUrl.searchParams.get("limit") || "20", 10) || 20,
      ),
    );

    const [total, data] = await Promise.all([
      Member.countDocuments({}),
      // Database-level projection: only fullName (+ the implicit _id) leaves
      // the database. No PII is fetched, so none can be returned.
      Member.find({})
        .select("fullName")
        .sort({ fullName: 1 })
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
