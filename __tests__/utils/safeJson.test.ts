import { safeJsonParse } from '../../src/utils/safeJson';

describe('safeJsonParse', () => {
  it('parses valid JSON', () => {
    expect(safeJsonParse('[1,2,3]', [])).toEqual([1, 2, 3]);
    expect(safeJsonParse('{"a":1}', {})).toEqual({ a: 1 });
    expect(safeJsonParse('"hello"', '')).toBe('hello');
  });

  it('returns the fallback for invalid JSON', () => {
    expect(safeJsonParse('not json', [])).toEqual([]);
    expect(safeJsonParse('{bad', { x: 1 })).toEqual({ x: 1 });
    expect(safeJsonParse('', [])).toEqual([]);
  });

  it('returns the fallback for null/undefined', () => {
    expect(safeJsonParse(null, 'fb')).toBe('fb');
    expect(safeJsonParse(undefined, 42)).toBe(42);
  });
});
