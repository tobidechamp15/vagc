// Dependency-free constant shared by the session helper and the Edge middleware
// (middleware must not import jsonwebtoken / next/headers).
export const SESSION_COOKIE = "church_session";
