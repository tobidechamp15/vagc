// Shared helper for sorting members by their upcoming birthday.
// dateOfBirth is stored as "YYYY-MM-DD".

const MS_PER_DAY = 24 * 60 * 60 * 1000;
// Sentinel ordinal for members without a usable dateOfBirth. Mirrors the old
// sort key (which returned Number.MAX_SAFE_INTEGER for missing/invalid dates,
// i.e. sorts LAST) so degenerate docs don't jump to the front of the directory.
// Any value > 365 preserves that ordering.
const INVALID_BIRTHDAY_ORDINAL = 3650;

/** Milliseconds until the member's next birthday (this year, or next year if it already passed). */
export function nextBirthdayKey(
  dob: string | undefined | null,
  now: Date = new Date(),
): number {
  if (!dob) return Number.MAX_SAFE_INTEGER;
  const parts = dob.split("-").map(Number);
  const m = parts[1];
  const d = parts[2];
  if (parts.length < 3 || !m || !d || Number.isNaN(m) || Number.isNaN(d)) {
    return Number.MAX_SAFE_INTEGER;
  }
  let next = new Date(now.getFullYear(), m - 1, d);
  if (next.getTime() < now.getTime()) {
    next = new Date(now.getFullYear() + 1, m - 1, d);
  }
  return next.getTime();
}

/** Sorts members so the closest upcoming birthday comes first (today's first). */
export function sortByUpcomingBirthday<T>(
  members: readonly T[],
  now: Date = new Date(),
): T[] {
  return [...members].sort((a, b) => {
    const dobA = (a as Partial<{ dateOfBirth?: string }> | null | undefined)
      ?.dateOfBirth;
    const dobB = (b as Partial<{ dateOfBirth?: string }> | null | undefined)
      ?.dateOfBirth;
    return nextBirthdayKey(dobA, now) - nextBirthdayKey(dobB, now);
  });
}

/**
 * Days until the member's next birthday, computed from the same this-year /
 * next-year rule as `nextBirthdayKey`, so the integer preserves the ordering
 * the in-memory sort produced. 0–365 for valid dates; missing/invalid dates
 * return INVALID_BIRTHDAY_ORDINAL (3650) so they still sort last, exactly as
 * `nextBirthdayKey`'s Number.MAX_SAFE_INTEGER did.
 *
 * Note: mirroring `nextBirthdayKey`, a birthday whose calendar day IS today is
 * treated as "next year" (≈365) once the day has started — the current app
 * behaviour, kept unchanged so the new DB sort returns the same content.
 *
 * Stored on each member as `nextBirthdayOrdinal` and refreshed on save and by
 * the daily cron, so the directory can be sorted with an indexed field sort
 * instead of fetching every member and sorting in JavaScript.
 */
export function daysUntilNextBirthday(
  dob: string | undefined | null,
  now: Date = new Date(),
): number {
  if (!dob) return INVALID_BIRTHDAY_ORDINAL;
  const parts = dob.split("-").map(Number);
  const m = parts[1];
  const d = parts[2];
  if (parts.length < 3 || !m || !d || Number.isNaN(m) || Number.isNaN(d)) {
    return INVALID_BIRTHDAY_ORDINAL;
  }
  let next = new Date(now.getFullYear(), m - 1, d);
  if (next.getTime() < now.getTime()) {
    next = new Date(now.getFullYear() + 1, m - 1, d);
  }
  // Both next and todayStart are midnights, so the difference is a whole
  // number of days regardless of the current time-of-day.
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((next.getTime() - todayStart.getTime()) / MS_PER_DAY);
}
