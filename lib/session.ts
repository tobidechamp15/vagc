import { cookies } from "next/headers";
import { verifyToken, TokenPayload, isSuperAdminEmail } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import { SESSION_COOKIE } from "@/lib/sessionCookie";

export { SESSION_COOKIE };

export function setSessionCookie(token: string) {
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
}

export function clearSessionCookie() {
  cookies().set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export function getSessionToken(): string | null {
  return cookies().get(SESSION_COOKIE)?.value ?? null;
}

/** Returns the verified session user, or null when missing/invalid. */
export function getSessionUser(): TokenPayload | null {
  const token = getSessionToken();
  if (!token) return null;
  try {
    return verifyToken(token);
  } catch {
    return null;
  }
}

/**
 * Verifies the session token AND that the account's status is currently
 * approved (fresh DB check per request). The super-admin account is exempt.
 * Used by dashboard server components/actions so rejected/pending accounts
 * cannot use the web dashboard, even with an unexpired session cookie.
 */
export async function requireApprovedSession(): Promise<TokenPayload | null> {
  const token = getSessionToken();
  if (!token) return null;
  let payload: TokenPayload;
  try {
    payload = verifyToken(token);
  } catch {
    return null;
  }
  try {
    await connectDB();
    const dbUser = await User.findById(payload.userId).select("status email");
    if (!dbUser) return null;
    const status: "pending" | "approved" | "rejected" =
      dbUser.status || "approved";
    if (status !== "approved" && !isSuperAdminEmail(dbUser.email)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
