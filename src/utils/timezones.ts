/**
 * Time zone helpers for the household "Time zone" setting.
 *
 * Hermes (React Native's engine) does not implement
 * `Intl.supportedValuesOf('timeZone')`, so the picker always uses a bundled
 * IANA list (canonical names, the same on every platform and in tests). The
 * phone's own zone is offered separately, and the server validates whatever is
 * saved.
 */
import { IANA_TIME_ZONES } from './timezoneList';

/** Every IANA zone the picker offers, sorted, including UTC. */
export const listTimeZones = (): string[] => [...IANA_TIME_ZONES];

/** This phone's IANA zone, or null when the runtime can't say. */
export const deviceTimeZone = (): string | null => {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof tz === 'string' && tz.trim() ? tz : null;
  } catch {
    return null;
  }
};

/**
 * Case-insensitive search that treats spaces and underscores alike, so
 * "new york" finds America/New_York.
 */
export const filterTimeZones = (zones: readonly string[], query: string): string[] => {
  const norm = (s: string) => s.toLowerCase().replace(/[_\s]+/g, ' ');
  const q = norm(query.trim());
  if (!q) return [...zones];
  return zones.filter((z) => norm(z).includes(q));
};

/** "America/New_York" → "America/New York" for display. */
export const formatTimeZone = (tz: string): string => tz.replace(/_/g, ' ');
