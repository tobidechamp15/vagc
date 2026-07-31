import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";

const JWT_SECRET = process.env.JWT_SECRET as string;

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
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
