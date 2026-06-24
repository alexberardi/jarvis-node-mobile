import { coerceTimeList, formatTime, parseTimeToDate } from '../../src/utils/time';

describe('time utils', () => {
  describe('parseTimeToDate', () => {
    it('parses HH:MM into hour/minute', () => {
      const d = parseTimeToDate('07:05');
      expect(d.getHours()).toBe(7);
      expect(d.getMinutes()).toBe(5);
    });

    it('tolerates a single-digit hour', () => {
      const d = parseTimeToDate('7:30');
      expect(d.getHours()).toBe(7);
      expect(d.getMinutes()).toBe(30);
    });

    it('falls back to 08:00 on garbage', () => {
      const d = parseTimeToDate('not a time');
      expect(d.getHours()).toBe(8);
      expect(d.getMinutes()).toBe(0);
    });

    it('clamps out-of-range values', () => {
      const d = parseTimeToDate('99:99');
      expect(d.getHours()).toBe(23);
      expect(d.getMinutes()).toBe(59);
    });
  });

  describe('formatTime', () => {
    it('zero-pads hour and minute', () => {
      const d = new Date();
      d.setHours(7, 5, 0, 0);
      expect(formatTime(d)).toBe('07:05');
    });

    it('round-trips with parseTimeToDate', () => {
      expect(formatTime(parseTimeToDate('19:00'))).toBe('19:00');
    });
  });

  describe('coerceTimeList', () => {
    it('passes a real array through as strings', () => {
      expect(coerceTimeList(['07:00', '19:00'])).toEqual(['07:00', '19:00']);
    });

    it('splits a comma/newline string', () => {
      expect(coerceTimeList('07:00, 19:00\n21:00')).toEqual(['07:00', '19:00', '21:00']);
    });

    it('returns [] for null/undefined/other', () => {
      expect(coerceTimeList(null)).toEqual([]);
      expect(coerceTimeList(undefined)).toEqual([]);
      expect(coerceTimeList(42)).toEqual([]);
    });
  });
});
