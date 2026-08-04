import jwt from "jsonwebtoken";
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";

const JWT_SECRET = process.env.JWT_SECRET as string;

// Accounts with this email are exempt from the pending/rejected status
// restrictions — they can always sign in and perform every action.
export const SUPER_ADMIN_EMAIL =
  process.env.SUPER_ADMIN_EMAIL || "example@gmail.com";

export function isSuperAdminEmail(email: string): boolean {
  return email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
}

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  name?: string;
}

export function signToken(payload: TokenPayload) {
  if (!JWT_SECRET) throw new Error("JWT_SECRET is not set");
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload;
}

// Extracts and verifies the Bearer token from a request. Returns null if missing/invalid.
export function getAuthUser(req: NextRequest): TokenPayload | null {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length);
  try {
    return verifyToken(token);
  } catch {
    return null;
  }
}

export interface AuthCheck {
  ok: boolean;
  user?: TokenPayload;
  status?: "pending" | "approved" | "rejected";
  reason?: "unauthorized" | "pending" | "rejected";
}

/**
 * Verifies the Bearer token AND that the account is approved (status === "approved").
 * Used to protect data APIs so pending/rejected accounts cannot read or mutate data.
 */
export async function requireApprovedUser(
  req: NextRequest,
): Promise<AuthCheck> {
  const auth = getAuthUser(req);
  if (!auth) return { ok: false, reason: "unauthorized" };
  try {
    await connectDB();
    const dbUser = await User.findById(auth.userId).select("status email");
    if (!dbUser) return { ok: false, reason: "unauthorized" };
    // Accounts created before the approval system have no status field —
    // treat them as already approved so existing admins aren't locked out.
    const status: "pending" | "approved" | "rejected" =
      dbUser.status || "approved";
    // The super-admin account is exempt from status restrictions.
    if (status !== "approved" && !isSuperAdminEmail(dbUser.email)) {
      return { ok: false, reason: status, status };
    }
    return { ok: true, user: auth };
  } catch {
    return { ok: false, reason: "unauthorized" };
  }
}

/** Builds the correct 401/403 JSON response for a failed auth check. */
export function authFailureResponse(check: AuthCheck): NextResponse {
  if (check.reason === "pending") {
    return NextResponse.json(
      { success: false, error: "Account pending approval." },
      { status: 403 },
    );
  }
  if (check.reason === "rejected") {
    return NextResponse.json(
      { success: false, error: "Your account was rejected." },
      { status: 403 },
    );
  }
  return NextResponse.json(
    { success: false, error: "Unauthorized" },
    { status: 401 },
  );
}
