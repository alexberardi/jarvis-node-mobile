/**
 * Compare two semver-ish version strings with SemVer 2.0 precedence.
 *
 * Returns negative if `a < b`, positive if `a > b`, 0 if equal. A leading
 * `v` and `+build` metadata are ignored; missing core parts are 0
 * ("1.2" === "1.2.0"). A prerelease is lower than its release
 * (0.1.0-rc18 < 0.1.0). Prerelease identifiers compare left to right:
 * numeric ones as numbers, below alphanumeric ones; an identifier like
 * `rc18` (no dot, as our node tags write it) compares its letters, then its
 * number, so rc9 < rc18 < rc19.
 */
export function compareSemver(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    const diff = pa.core[i] - pb.core[i];
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  if (pa.pre.length === 0 || pb.pre.length === 0) {
    return pa.pre.length === pb.pre.length ? 0 : pa.pre.length === 0 ? 1 : -1;
  }
  const len = Math.max(pa.pre.length, pb.pre.length);
  for (let i = 0; i < len; i++) {
    if (i >= pa.pre.length) return -1;
    if (i >= pb.pre.length) return 1;
    const diff = compareIdentifier(pa.pre[i], pb.pre[i]);
    if (diff !== 0) return diff;
  }
  return 0;
}

function parseVersion(v: string): { core: number[]; pre: string[] } {
  const noBuild = v.trim().replace(/^v/i, '').split('+')[0];
  const dash = noBuild.indexOf('-');
  const coreStr = dash === -1 ? noBuild : noBuild.slice(0, dash);
  const preStr = dash === -1 ? '' : noBuild.slice(dash + 1);
  const parts = coreStr.split('.').map((p) => parseInt(p, 10) || 0);
  return {
    core: [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0],
    pre: preStr === '' ? [] : preStr.split('.'),
  };
}

function compareIdentifier(x: string, y: string): number {
  const nx = /^\d+$/.test(x);
  const ny = /^\d+$/.test(y);
  if (nx && ny) return Math.sign(Number(x) - Number(y));
  if (nx) return -1;
  if (ny) return 1;
  // rc18 vs rc9: same letters, then the numeric tail as a number.
  const mx = /^(.*?)(\d+)$/.exec(x);
  const my = /^(.*?)(\d+)$/.exec(y);
  if (mx && my && mx[1] === my[1]) return Math.sign(Number(mx[2]) - Number(my[2]));
  return x < y ? -1 : x > y ? 1 : 0;
}

/** True when `latest` is strictly newer than `installed`. */
export function isUpdateAvailable(installed: string | null | undefined, latest: string): boolean {
  if (!installed) return false;
  if (installed === 'unknown') return true; // legacy installs — assume outdated
  return compareSemver(installed, latest) < 0;
}
