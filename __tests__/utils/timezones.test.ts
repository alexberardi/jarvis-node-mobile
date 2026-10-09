import {
  deviceTimeZone,
  filterTimeZones,
  formatTimeZone,
  listTimeZones,
} from '../../src/utils/timezones';

describe('timezones', () => {
  it('lists canonical IANA zones, sorted, with UTC', () => {
    const zones = listTimeZones();
    expect(zones.length).toBeGreaterThan(300);
    expect(zones).toEqual(expect.arrayContaining(['UTC', 'America/New_York', 'Europe/Kyiv', 'Asia/Kolkata']));
    expect([...zones].sort()).toEqual(zones);
    expect(new Set(zones).size).toBe(zones.length);
    expect(zones).not.toContain('Local');
  });

  it('searches case-insensitively, treating spaces and underscores alike', () => {
    const zones = ['America/New_York', 'Europe/London', 'America/Los_Angeles'];
    expect(filterTimeZones(zones, 'new york')).toEqual(['America/New_York']);
    expect(filterTimeZones(zones, 'LOS_ang')).toEqual(['America/Los_Angeles']);
    expect(filterTimeZones(zones, 'america')).toHaveLength(2);
    expect(filterTimeZones(zones, '  ')).toEqual(zones);
    expect(filterTimeZones(zones, 'mars')).toEqual([]);
  });

  it('formats underscores as spaces', () => {
    expect(formatTimeZone('America/New_York')).toBe('America/New York');
  });

  it("reads the phone's zone and survives a runtime without one", () => {
    expect(typeof deviceTimeZone()).toBe('string');
    const spy = jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new Error('no Intl');
    });
    expect(deviceTimeZone()).toBeNull();
    spy.mockRestore();
  });
});
