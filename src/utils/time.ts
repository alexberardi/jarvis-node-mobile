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
