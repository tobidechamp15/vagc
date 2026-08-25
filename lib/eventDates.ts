/**
 * Event descriptions must state the day(s) or date(s) the event occurs on.
 *
 * A single startsAt/endsAt range isn't enough to tell members *when* to attend —
 * an event can run across several days within a week and stretch over months
 * (e.g. a revival every Mon/Wed/Fri for two months). So every event description
 * is required to include an explicit day-of-week or calendar date reference.
 *
 * Shared by the API routes (POST/PUT /api/events) and the dashboard server
 * actions so the mobile app and web dashboard enforce the same rule.
 */

const WEEKDAYS =
  /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\b/i;

const MONTHS =
  /\b(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b/i;

// Numeric dates: 12/08, 12/08/2026, 12-08-2026, 2026-08-12
const NUMERIC_DATE =
  /\b\d{1,2}[-/]\d{1,2}(?:[-/]\d{2,4})?\b|\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/;

// Ordinal day of month: "1st", "2nd", "3rd", "4th", …
const ORDINAL_DAY = /\b\d{1,2}(?:st|nd|rd|th)\b/i;

// "August 12", "12th August", "Aug 12", "12 Aug" (month + day, either order)
const MONTH_PLUS_DAY = new RegExp(
  `(${MONTHS.source})\\s+\\d{1,2}(?:st|nd|rd|th)?|\\d{1,2}(?:st|nd|rd|th)?\\s+(${MONTHS.source})`,
  "i",
);

/** True when `text` mentions a weekday, a calendar date, or a day-of-month. */
export function hasEventDayOrDate(text: string): boolean {
  if (!text) return false;
  return (
    WEEKDAYS.test(text) ||
    NUMERIC_DATE.test(text) ||
    ORDINAL_DAY.test(text) ||
    MONTH_PLUS_DAY.test(text)
  );
}

/** User-facing error shown when the rule isn't met. */
export const EVENT_DESCRIPTION_DAY_DATE_ERROR =
  'Description must include the day(s) or date(s) the event occurs on (e.g. "Every Monday & Wednesday" or "12th–14th August 2026").';
