// Shared helper for sorting members by their upcoming birthday.
// dateOfBirth is stored as "YYYY-MM-DD".

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
