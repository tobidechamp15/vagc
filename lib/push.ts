import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import Device from "@/models/Device";
import { logger } from "@/lib/logger";

// ── Expo Push API (DEV-26) ────────────────────────────────────────────────
// The Expo Push service is the sender for `expo-notifications` on the mobile
// side. A device registers its push token via POST /api/users/me/push-token,
// and this module fans a message out to every registered token through
// https://exp.host/--/api/v2/push/send.
//
// Docs: https://docs.expo.dev/push-notifications/sending-notifications/
const EXPO_PUSH_API_URL = "https://exp.host/--/api/v2/push/send";

// The Expo Push service accepts at most 100 messages per request.
const EXPO_PUSH_BATCH_SIZE = 100;

// A message ready to POST to the Expo Push API (one per device token).
export interface ExpoPushMessage {
  to: string; // Expo push token, e.g. "ExponentPushToken[xxxx]"
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  sound?: "default" | string;
  channelId?: string; // Android notification channel (expo-notifications)
  priority?: "default" | "normal" | "high";
}

export interface PushSendResult {
  sent: number;
  failed: number;
  /** Tokens the Expo service flagged as permanently invalid (e.g. app uninstalled). */
  invalidTokens: string[];
  errors: { token: string; message: string }[];
}

// All push notification categories. Each maps to a boolean toggle inside a
// `notificationPrefs` sub-document — a device only receives a category if that
// pref (AND `masterPushEnabled`) is on. Prefs live at BOTH the device level
// (everyone, logged-in or not) and the account level (signed-in staff), and a
// linked device must have both ON to receive a category.
export const PUSH_CATEGORY_PREF_KEYS: Record<string, string> = {
  announcements: "announcements",
  eventInvitations: "eventInvitations",
  serviceReminders: "serviceReminders",
  prayerRequests: "prayerRequests",
  newMemberWelcomes: "newMemberWelcomes",
  paymentConfirmations: "paymentConfirmations",
  givingReminders: "givingReminders",
  newsletter: "newsletter",
};

/** Expo push tokens look like `ExponentPushToken[...]` or `ExpoPushToken[...]`. */
export function isExpoPushToken(token: string): boolean {
  return /^ExponentPushToken\[[A-Za-z0-9_-]+\]$|^ExpoPushToken\[[A-Za-z0-9_-]+\]$/.test(
    token.trim(),
  );
}

/**
 * POST a batch of messages to the Expo Push API.
 *
 * The endpoint can return 200 with per-message statuses, so "ok" is decided per
 * message. Tokens flagged as `DeviceNotRegistered` / `MessageTooBig` are
 * collected into `invalidTokens` so callers can drop them from the DB.
 */
export async function sendPushMessages(
  messages: ExpoPushMessage[],
): Promise<PushSendResult> {
  const result: PushSendResult = {
    sent: 0,
    failed: 0,
    invalidTokens: [],
    errors: [],
  };
  if (messages.length === 0) return result;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  // Production Expo projects (non-development) require an access token.
  if (process.env.EXPO_ACCESS_TOKEN) {
    headers["Authorization"] = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  }

  for (let i = 0; i < messages.length; i += EXPO_PUSH_BATCH_SIZE) {
    const batch = messages.slice(i, i + EXPO_PUSH_BATCH_SIZE);

    let res: Response;
    try {
      res = await fetch(EXPO_PUSH_API_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(batch),
      });
    } catch (err: any) {
      // Network / timeout — the whole batch failed.
      for (const m of batch) {
        result.failed++;
        result.errors.push({ token: m.to, message: err.message });
      }
      continue;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      for (const m of batch) {
        result.failed++;
        result.errors.push({
          token: m.to,
          message: `HTTP ${res.status}: ${text.slice(0, 200)}`,
        });
      }
      continue;
    }

    const json = await res.json().catch(() => ({}));
    const perMessage = Array.isArray(json.data) ? json.data : [];

    perMessage.forEach((r: any, idx: number) => {
      const token = batch[idx]?.to ?? "";
      if (r?.status === "ok") {
        result.sent++;
        return;
      }
      result.failed++;
      const code = r?.details?.error;
      const message =
        typeof r?.message === "string"
          ? r.message
          : `Unknown error${code ? ` (${code})` : ""}`;
      result.errors.push({ token, message });
      // These two errors mean the token is dead — drop it from the account so
      // we stop paying for dead sends on every future push.
      if (code === "DeviceNotRegistered" || code === "MessageTooBig") {
        result.invalidTokens.push(token);
      }
    });
  }

  return result;
}

export interface SendPushOptions {
  title: string;
  body: string;
  /**
   * Optional category. When set, only recipients whose matching
   * `notificationPrefs` toggle is ON (and `masterPushEnabled`) are targeted.
   * When omitted, ALL recipients with at least one push token and
   * masterPushEnabled are targeted.
   */
  category?: string;
  /** Optional allow-list — restrict delivery to these user ids only. */
  userIds?: string[];
  data?: Record<string, unknown>;
  channelId?: string;
}

/**
 * Send a push notification to every eligible registered device.
 *
 * Recipients come from the Device collection (one doc per physical device, so
 * logged-in AND logged-out installs are covered — DEV-26 ext.). Eligibility
 * (server-side, mirrors DEV-13 prefs):
 *   - device has ≥ 1 stored push token,
 *   - `notificationPrefs.masterPushEnabled` is not explicitly false,
 *   - if `category` is provided, that category's pref toggle is ON,
 *   - if the device is linked to an account (`userId`), the account's prefs
 *     ALSO gate delivery (account-level is the master switch for staff): the
 *     category must be ON in BOTH the device prefs and the account prefs, and
 *     the account must be approved.
 *
 * Tokens the Expo service reports as dead are removed from their owning Device
 * doc (or legacy User doc) so they don't get hit again on future sends.
 */
export async function sendPushNotification(
  opts: SendPushOptions,
): Promise<PushSendResult> {
  await connectDB();

  const categoryKey =
    opts.category && PUSH_CATEGORY_PREF_KEYS[opts.category]
      ? PUSH_CATEGORY_PREF_KEYS[opts.category]
      : null;

  // ── Device-level recipients (primary) ────────────────────────────────────
  const deviceQuery: Record<string, unknown> = {
    pushTokens: { $exists: true, $ne: [] },
  };
  if (opts.userIds?.length) {
    // Allow-list targets signed-in accounts: only devices linked to them.
    deviceQuery.userId = { $in: opts.userIds };
  }
  const devices = await Device.find(deviceQuery).lean();

  // Batch-load the account prefs of every linked device once (account-level is
  // the master switch for staff devices).
  const linkedUserIds = [
    ...new Set(
      devices
        .map((d: any) => d.userId)
        .filter((id: unknown): id is string => !!id),
    ),
  ];
  const linkedUsers = linkedUserIds.length
    ? await User.find({ _id: { $in: linkedUserIds } })
        .select("notificationPrefs status")
        .lean()
    : [];
  const userById = new Map<string, any>();
  for (const u of linkedUsers as any[]) userById.set(String(u._id), u);

  const messages: ExpoPushMessage[] = [];
  const tokenOwner = new Map<string, string>(); // token -> owner id (cleanup)
  const tokenOwnerKind = new Map<string, "device" | "user">();
  const coveredTokens = new Set<string>(); // tokens already handled via Device

  for (const device of devices as any[]) {
    const devicePrefs: Record<string, unknown> = device.notificationPrefs || {};
    const linkedUser = device.userId
      ? userById.get(String(device.userId))
      : null;

    // Pending/rejected accounts never receive pushes (legacy docs with no
    // status field are treated as approved).
    if (linkedUser && ["pending", "rejected"].includes(linkedUser.status)) {
      continue;
    }

    // Master switch must be ON for the device AND (if linked) the account.
    const masterOn =
      devicePrefs.masterPushEnabled !== false &&
      (!linkedUser ||
        linkedUser.notificationPrefs?.masterPushEnabled !== false);
    if (!masterOn) continue;

    if (categoryKey) {
      const deviceOn = devicePrefs[categoryKey] !== false;
      const accountOn =
        !linkedUser || linkedUser.notificationPrefs?.[categoryKey] !== false;
      if (!deviceOn || !accountOn) continue;
    }

    for (const t of device.pushTokens || []) {
      const token = typeof t.token === "string" ? t.token.trim() : "";
      if (!token || !isExpoPushToken(token)) continue;
      coveredTokens.add(token);
      messages.push({
        to: token,
        title: opts.title,
        body: opts.body,
        data: opts.data,
        channelId: opts.channelId,
        sound: opts.channelId ? undefined : "default",
        priority: "high",
      });
      tokenOwner.set(token, String(device._id));
      tokenOwnerKind.set(token, "device");
    }
  }

  // ── Legacy account tokens (pre-device-registration) ──────────────────────
  // Devices that registered under the old /users/me/push-token flow store their
  // token on the User doc. Keep delivering to those (account-level prefs only)
  // so already-installed apps don't silently lose push. Tokens already handled
  // by a Device doc are skipped to avoid a duplicate delivery.
  const userFilter: Record<string, unknown> = {
    pushTokens: { $exists: true, $ne: [] },
    // Master switch must not be explicitly off (missing = legacy default on).
    "notificationPrefs.masterPushEnabled": { $ne: false },
    status: { $nin: ["pending", "rejected"] },
  };
  if (opts.userIds?.length) {
    userFilter._id = { $in: opts.userIds };
  }
  if (categoryKey) {
    userFilter[`notificationPrefs.${categoryKey}`] = true;
  }

  const legacyUsers = await User.find(userFilter)
    .select("pushTokens notificationPrefs")
    .lean();
  for (const user of legacyUsers as any[]) {
    for (const t of user.pushTokens || []) {
      const token = typeof t.token === "string" ? t.token.trim() : "";
      if (!token || !isExpoPushToken(token)) continue;
      if (coveredTokens.has(token)) continue;
      messages.push({
        to: token,
        title: opts.title,
        body: opts.body,
        data: opts.data,
        channelId: opts.channelId,
        sound: opts.channelId ? undefined : "default",
        priority: "high",
      });
      tokenOwner.set(token, String(user._id));
      tokenOwnerKind.set(token, "user");
    }
  }

  const result = await sendPushMessages(messages);

  // Remove dead tokens from their owners (best-effort — never fail the send
  // because a cleanup write failed).
  if (result.invalidTokens.length > 0) {
    const byDevice = new Map<string, string[]>();
    const byUser = new Map<string, string[]>();
    for (const token of result.invalidTokens) {
      const ownerId = tokenOwner.get(token);
      if (!ownerId) continue;
      if (tokenOwnerKind.get(token) === "device") {
        if (!byDevice.has(ownerId)) byDevice.set(ownerId, []);
        byDevice.get(ownerId)!.push(token);
      } else {
        if (!byUser.has(ownerId)) byUser.set(ownerId, []);
        byUser.get(ownerId)!.push(token);
      }
    }
    for (const [deviceId, tokens] of byDevice) {
      try {
        await Device.updateOne(
          { _id: deviceId },
          { $pull: { pushTokens: { token: { $in: tokens } } } },
        );
      } catch (err) {
        logger.warn("Failed to prune dead device push token", {
          deviceId,
          err,
        });
      }
    }
    for (const [userId, tokens] of byUser) {
      try {
        await User.updateOne(
          { _id: userId },
          { $pull: { pushTokens: { token: { $in: tokens } } } },
        );
      } catch (err) {
        logger.warn("Failed to prune dead user push token", { userId, err });
      }
    }
  }

  return result;
}
