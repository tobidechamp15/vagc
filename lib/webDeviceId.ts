/**
 * Browser device identifier for the public web prayer wall (DEV-29).
 *
 * The mobile app persists an anonymous device id (mobile/src/lib/deviceId.ts)
 * in SecureStore and sends it with every public wall action (submit / pray /
 * report) so moderation can block a device that posts inappropriate content.
 * Browsers have no SecureStore, so the web wall persists the same identifier
 * in localStorage under the same key name, so a blocked device is rejected
 * (403) here exactly as it is in the app.
 *
 * Server-side guard: `window` only exists after mount, so during SSR this
 * returns "" and the client resolves the real id in a useEffect.
 */

const DEVICE_ID_KEY = "church_app_device_id";

// RFC 4122 v4 generator — same dependency-free scheme as the mobile app.
function generateUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// In-memory cache so a single session only touches localStorage once.
let cachedDeviceId: string | null = null;

/**
 * Returns the persisted browser device id, creating + storing it on first
 * call. Never throws for normal use — if localStorage is unavailable (private
 * mode, disabled) it falls back to a fresh in-memory id so the wall still
 * works this session.
 */
export async function getWebDeviceId(): Promise<string> {
  if (typeof window === "undefined") return ""; // SSR
  if (cachedDeviceId) return cachedDeviceId;
  try {
    let id = window.localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = generateUuid();
      window.localStorage.setItem(DEVICE_ID_KEY, id);
    }
    cachedDeviceId = id;
    return id;
  } catch {
    cachedDeviceId = generateUuid();
    return cachedDeviceId;
  }
}
