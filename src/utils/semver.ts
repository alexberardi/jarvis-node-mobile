/**
 * Compare two semver-ish version strings.
 *
 * Returns negative if `a < b`, positive if `a > b`, 0 if equal. Treats
 * missing/non-numeric parts as 0 ("1.2" === "1.2.0"). Pre-release suffixes
 * (-rc1, +meta) are split on punctuation and compared numerically per
 * component — good enough for our package-version use case. We're not
 * trying to be node-semver.
 */
export function compareSemver(a: string, b: string): number {
  const partsA = a.split(/[.+-]/).map((p) => parseInt(p, 10) || 0);
  const partsB = b.split(/[.+-]/).map((p) => parseInt(p, 10) || 0);
  const len = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < len; i++) {
    const diff = (partsA[i] || 0) - (partsB[i] || 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

/** True when `latest` is strictly newer than `installed`. */
export function isUpdateAvailable(installed: string | null | undefined, latest: string): boolean {
  if (!installed) return false;
  if (installed === 'unknown') return true; // legacy installs — assume outdated
  return compareSemver(installed, latest) < 0;
}
