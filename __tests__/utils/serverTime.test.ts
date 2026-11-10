import { formatLastSeen, parseServerDate, parseServerTimestamp } from '../../src/utils/serverTime';

const UTC = (s: string) => Date.parse(s);

describe('parseServerTimestamp', () => {
  it('treats a naive date-time as UTC, not local time', () => {
    expect(parseServerTimestamp('2026-10-12T14:03:07')).toBe(UTC('2026-10-12T14:03:07Z'));
  });

  it('accepts microsecond fractions (truncated to ms)', () => {
    expect(parseServerTimestamp('2026-10-12T14:03:07.123456')).toBe(UTC('2026-10-12T14:03:07.123Z'));
    expect(parseServerTimestamp('2026-10-12T14:03:07.5')).toBe(UTC('2026-10-12T14:03:07.500Z'));
  });

  it('accepts a space separator and a minutes-only time', () => {
    expect(parseServerTimestamp('2026-10-12 14:03:07')).toBe(UTC('2026-10-12T14:03:07Z'));
    expect(parseServerTimestamp('2026-10-12T14:03')).toBe(UTC('2026-10-12T14:03:00Z'));
  });

  it('honors Z and numeric offsets', () => {
    expect(parseServerTimestamp('2026-10-12T14:03:07Z')).toBe(UTC('2026-10-12T14:03:07Z'));
    expect(parseServerTimestamp('2026-10-12T14:03:07.250z')).toBe(UTC('2026-10-12T14:03:07.250Z'));
    expect(parseServerTimestamp('2026-10-12T10:03:07-04:00')).toBe(UTC('2026-10-12T14:03:07Z'));
    expect(parseServerTimestamp('2026-10-12T16:03:07+0200')).toBe(UTC('2026-10-12T14:03:07Z'));
    expect(parseServerTimestamp('2026-10-12T19:33:07+05:30')).toBe(UTC('2026-10-12T14:03:07Z'));
    expect(parseServerTimestamp('2026-10-12T16:03:07+02')).toBe(UTC('2026-10-12T14:03:07Z'));
  });

  it('gives the same instant for the naive and RFC 3339 forms', () => {
    expect(parseServerTimestamp('2026-10-12T14:03:07.123456')).toBe(
      parseServerTimestamp('2026-10-12T14:03:07.123456Z'),
    );
  });

  it('falls back to the engine for a bare date', () => {
    expect(parseServerTimestamp('2026-10-12')).toBe(UTC('2026-10-12T00:00:00Z'));
  });

  it('returns null for empty or garbage input', () => {
    expect(parseServerTimestamp(null)).toBeNull();
    expect(parseServerTimestamp(undefined)).toBeNull();
    expect(parseServerTimestamp('')).toBeNull();
    expect(parseServerTimestamp('garbage')).toBeNull();
    expect(parseServerTimestamp('2026-13-45T99:99:99')).toBeNull();
  });

  it('parseServerDate wraps the same instant', () => {
    expect(parseServerDate('2026-10-12T14:03:07')?.toISOString()).toBe('2026-10-12T14:03:07.000Z');
    expect(parseServerDate('nope')).toBeNull();
  });
});

describe('formatLastSeen', () => {
  // A fixed clock: every case passes `now` explicitly, so nothing depends on
  // the wall clock or the machine's time zone.
  const now = UTC('2026-10-12T18:00:00Z');

  it('says Never with no timestamp and Unknown for an unparseable one', () => {
    expect(formatLastSeen(null, false, now)).toBe('Never');
    expect(formatLastSeen('bogus', false, now)).toBe('Unknown');
  });

  it('reads a naive timestamp hours ago as hours ago, not "Just now"', () => {
    // Four hours ago in UTC. Parsed as local time in a UTC-4 zone this used to
    // land "now" or in the future, and the offline node read "Just now".
    expect(formatLastSeen('2026-10-12T14:00:00', false, now)).toBe('4h ago');
    expect(formatLastSeen('2026-10-12T14:00:00Z', false, now)).toBe('4h ago');
  });

  it('only says "Just now" for an online node', () => {
    expect(formatLastSeen('2026-10-12T17:59:40', true, now)).toBe('Just now');
    expect(formatLastSeen('2026-10-12T17:59:40', false, now)).toBe('less than a minute ago');
  });

  it('never says "Just now" for an offline node stamped ahead of the phone clock', () => {
    expect(formatLastSeen('2026-10-12T18:05:00Z', false, now)).toBe('less than a minute ago');
  });

  it('formats minutes, hours and days', () => {
    expect(formatLastSeen('2026-10-12T17:45:00Z', false, now)).toBe('15m ago');
    expect(formatLastSeen('2026-10-11T19:00:00Z', false, now)).toBe('23h ago');
    expect(formatLastSeen('2026-10-09T18:00:00Z', false, now)).toBe('3d ago');
  });

  it('falls back to a date beyond a week', () => {
    const ts = '2026-09-01T12:00:00Z';
    expect(formatLastSeen(ts, false, now)).toBe(new Date(UTC(ts)).toLocaleDateString());
  });
});
