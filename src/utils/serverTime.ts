/**
 * Server timestamp helpers.
 *
 * The backend has historically emitted *naive* UTC ISO strings
 * ("2026-10-12T14:03:07.123456", no zone). `new Date()` reads a zone-less
 * date-time as LOCAL time, which shifts it by the device's UTC offset — in US
 * time zones a node that went offline hours ago looked like it was seen in the
 * future, and "last seen" read "Just now". Newer servers send RFC 3339 with a
 * `Z` or an offset; both shapes must parse to the same instant.
 */

// date, then T or space, then a time, then optional fraction, then optional zone
const ISO_DATETIME =
  /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)(?:[.,](\d+))?\s*([zZ]|[+-]\d{2}(?::?\d{2})?)?$/;

/**
 * Parse a server timestamp to epoch milliseconds. A date-time without a zone
 * is treated as UTC; a `Z` or `±HH:MM` offset is honored. Fractional seconds
 * beyond milliseconds are truncated (Hermes is stricter than V8 here). Returns
 * null for empty or unparseable input.
 */
export const parseServerTimestamp = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const trimmed = value.trim();
  const m = ISO_DATETIME.exec(trimmed);
  if (!m) {
    // Not a date-time we recognise (e.g. a bare date) — defer to the engine.
    const ms = Date.parse(trimmed);
    return Number.isNaN(ms) ? null : ms;
  }
  const [, date, time, fraction, zone] = m;
  const hms = time.length === 5 ? `${time}:00` : time;
  const millis = fraction ? `.${fraction.slice(0, 3).padEnd(3, '0')}` : '';
  let offset = 'Z';
  if (zone && zone.toUpperCase() !== 'Z') {
    // Normalise "+0200" / "+02" to "+02:00".
    const digits = zone.slice(1).replace(':', '').padEnd(4, '0');
    offset = `${zone[0]}${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
  }
  const ms = Date.parse(`${date}T${hms}${millis}${offset}`);
  return Number.isNaN(ms) ? null : ms;
};

/** {@link parseServerTimestamp} as a Date, or null. */
export const parseServerDate = (value: string | null | undefined): Date | null => {
  const ms = parseServerTimestamp(value);
  return ms === null ? null : new Date(ms);
};

/**
 * "Last seen" text for a node. "Just now" is reserved for an online node: an
 * offline node always gets a real relative time, so a fresh-but-offline node
 * (or a timestamp a little ahead of the phone's clock) never reads as live.
 */
export const formatLastSeen = (
  lastSeen: string | null | undefined,
  online: boolean,
  now: number = Date.now(),
): string => {
  if (!lastSeen) return 'Never';
  const ts = parseServerTimestamp(lastSeen);
  if (ts === null) return 'Unknown';
  const diffMins = Math.floor((now - ts) / 60_000);
  if (diffMins < 1) return online ? 'Just now' : 'less than a minute ago';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(ts).toLocaleDateString();
};
