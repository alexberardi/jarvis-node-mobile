import fs from 'fs';
import path from 'path';

// The robot icon means one thing in the app: a desktop agent (the Jarvis
// Automation agent on a computer). Routines, background tasks and automations
// use other icons, so the only place that may name it is utils/nodeKind.ts.

const SRC = path.join(__dirname, '../../src');

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });

describe('the robot icon is reserved for desktop agents', () => {
  it('is named only in utils/nodeKind.ts', () => {
    const offenders = walk(SRC)
      .filter((f) => !f.endsWith(path.join('utils', 'nodeKind.ts')))
      .filter((f) => /['"]robot['"]/.test(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(SRC, f));
    expect(offenders).toEqual([]);
  });
});
