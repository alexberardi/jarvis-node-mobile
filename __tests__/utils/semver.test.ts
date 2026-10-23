import { compareSemver, isUpdateAvailable } from '../../src/utils/semver';

// SemVer 2.0 precedence: a prerelease is lower than its release, and the
// numeric part of a prerelease identifier compares as a number (#496).

const sign = (n: number) => Math.sign(n);

it.each([
  ['0.1.0-rc18', '0.1.0-rc19', -1],
  ['0.1.0-rc19', '0.1.0', -1],
  ['0.1.0-rc18', '0.1.0', -1],
  ['0.1.0-rc.18', '0.1.0', -1],
  ['0.1.0-rc9', '0.1.0-rc18', -1],
  ['0.1.0-rc.9', '0.1.0-rc.18', -1],
  ['0.1.0-alpha', '0.1.0-alpha.1', -1],
  ['0.1.0-alpha.1', '0.1.0-alpha.beta', -1],
  ['0.1.0-alpha', '0.1.0-beta', -1],
  ['0.1.0', '0.1.1-rc1', -1],
  ['0.3.6', '0.1.0-rc18', 1],
  ['1.10.0', '1.9.0', 1],
  ['v0.1.0-rc18', '0.1.0-rc18', 0],
  ['0.1.0+build5', '0.1.0', 0],
  ['1.2', '1.2.0', 0],
  ['0.1.0-rc18', '0.1.0-rc18', 0],
])('compareSemver(%s, %s) has sign %d', (a, b, expected) => {
  expect(sign(compareSemver(a, b))).toBe(expected);
  expect(sign(compareSemver(b, a))).toBe(-expected || 0);
});

it('isUpdateAvailable follows prerelease precedence', () => {
  expect(isUpdateAvailable('0.1.0-rc18', '0.1.0-rc19')).toBe(true);
  expect(isUpdateAvailable('0.1.0-rc18', '0.1.0')).toBe(true);
  expect(isUpdateAvailable('0.1.0', '0.1.0-rc19')).toBe(false);
  expect(isUpdateAvailable('0.1.0-rc18', '0.1.0-rc18')).toBe(false);
  expect(isUpdateAvailable('unknown', '1.0.0')).toBe(true);
  expect(isUpdateAvailable(null, '1.0.0')).toBe(false);
});
