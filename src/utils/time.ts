/**
 * Helpers for round-tripping "HH:MM" wall-clock strings to/from the Date
 * objects @react-native-community/datetimepicker works with.
 *
 * Only the hour/minute matter; the date portion is whatever "today" is and
 * is ignored on the way back out.
 */

/** Parse "HH:MM" into a Date (today) with that hour/minute. Falls back to
 *  08:00 for unparseable input, clamping out-of-range values. */
export const parseTimeToDate = (hhmm: string): Date => {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm ?? '').trim());
  const d = new Date();
  d.setSeconds(0, 0);
  if (!m) {
    d.setHours(8, 0, 0, 0);
    return d;
  }
  const hh = Math.max(0, Math.min(23, parseInt(m[1], 10)));
  const mm = Math.max(0, Math.min(59, parseInt(m[2], 10)));
  d.setHours(hh, mm, 0, 0);
  return d;
};

/** Format a Date back to zero-padded "HH:MM". */
export const formatTime = (d: Date): string => {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};

/** Coerce a stored dose_times value (a real list, a comma/newline string, or
 *  null) into a clean string[]. Mirrors the node's coerce_dose_times so an
 *  edit that round-tripped as text still renders as discrete rows. */
export const coerceTimeList = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (typeof value === 'string') {
    return value
      .split(/[,\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
};

/**
 * ISO 8601 local-wall-clock helpers, for editable inbox-card fields of
 * input_type "datetime" (values like "2026-08-11T18:00:00" — no timezone,
 * interpreted as local time). The value that flows through the callback merge
 * MUST stay this ISO string shape (command-center's add_event parses ISO), so
 * these convert to/from the Date @react-native-community/datetimepicker wants
 * WITHOUT ever going through UTC (toISOString would shift the wall time).
 */

/** Parse an ISO 8601 datetime string into a Date. A bare date-time with no
 *  offset ("YYYY-MM-DDTHH:MM:SS") is interpreted as local time. Unparseable
 *  input falls back to now (rounded to the minute) so the picker still opens. */
export const parseIsoToDate = (iso: string): Date => {
  const parsed = new Date((iso ?? '').trim());
  if (Number.isNaN(parsed.getTime())) {
    const now = new Date();
    now.setSeconds(0, 0);
    return now;
  }
  return parsed;
};

/** Format a Date back to a local-wall-clock ISO 8601 string
 *  ("YYYY-MM-DDTHH:MM:SS") — built from local components, NOT toISOString(),
 *  so 18:00 local stays 18:00 rather than shifting to UTC. */
export const formatDateToIso = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
};

/** Friendly, locale-aware display of an ISO datetime (e.g. "Tue, Aug 11,
 *  6:00 PM"). Falls back to the raw string if it can't be parsed. */
export const formatIsoFriendly = (iso: string): string => {
  const d = new Date((iso ?? '').trim());
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};
