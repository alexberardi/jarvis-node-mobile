/**
 * Static checks on the Maestro flows in `.maestro/`, so a broken flow is caught by
 * `npm test` instead of by the overnight emulator run (jarvis-server `scripts/e2e mobile`):
 *
 * - the runner contract (jarvis-server docs/decisions/2026-10-18-e2e-mobile-runner.md):
 *   every top-level flow targets the app, starts with `launchApp: {clearState: true}`
 *   unless it is tagged `skip`, and a skipped flow says why (`properties.skip_reason`);
 * - every `runFlow` file exists;
 * - every `id:` selector names a testID that exists in `src/` (or `App.tsx`);
 * - an `inputText` that interpolates is one whole `${...}` expression: Maestro drops the
 *   space after a `${...}` segment followed by literal text (`"${NAME} E2E"` typed
 *   "NameE2E"), so build the string in the expression (`${NAME + ' E2E'}`).
 *
 * No YAML parser: the flows are written in a plain block style this reads line by line.
 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const MAESTRO = path.join(ROOT, '.maestro');

const isFlow = (f: string) => /\.ya?ml$/.test(f);

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

const topLevel = fs
  .readdirSync(MAESTRO)
  .filter((f) => isFlow(f) && f !== 'config.yaml')
  .map((f) => path.join(MAESTRO, f));
const allFlows = walk(MAESTRO).filter(isFlow);
const CLEAR_FIELD = path.join(MAESTRO, 'subflows', 'clear-field.yaml');

/** Header (before the first `---` line) and steps of a flow file. */
function split(file: string): { header: string; steps: string } {
  const text = fs.readFileSync(file, 'utf8');
  const m = text.match(/^---\s*$/m);
  if (!m || m.index === undefined) return { header: text, steps: '' };
  return { header: text.slice(0, m.index), steps: text.slice(m.index + m[0].length) };
}

/** Uncommented lines only. */
const lines = (s: string) => s.split('\n').filter((l) => !/^\s*#/.test(l));

/** `tags: [a, skip]`, or a `tags:` block list with a `- skip` item. */
function isSkipped(header: string): boolean {
  const hl = lines(header);
  const at = hl.findIndex((l) => /^tags:/.test(l));
  if (at < 0) return false;
  if (/^tags:\s*\[.*\bskip\b.*\]/.test(hl[at])) return true;
  for (const l of hl.slice(at + 1)) {
    const item = l.match(/^\s+-\s*(\S+)\s*$/);
    if (!item) break;
    if (item[1] === 'skip') return true;
  }
  return false;
}

// ── testIDs in the app's source ──────────────────────────────────────────────

function sourceFiles(): string[] {
  return [...walk(path.join(ROOT, 'src')), path.join(ROOT, 'App.tsx')].filter((f) =>
    /\.tsx?$/.test(f),
  );
}

type SourceID = { re: RegExp; sample: string };

/**
 * Every testID literal in the source: as a regex (template parts match anything) and as a
 * sample (template parts replaced by `v`).
 */
function sourceTestIDs(): SourceID[] {
  const out: SourceID[] = [];
  for (const file of sourceFiles()) {
    const src = fs.readFileSync(file, 'utf8').split('\n');
    src.forEach((line, i) => {
      const at = line.search(/testID|TestID/);
      if (at < 0) return;
      // A value that starts on the next line (`testID={\n  cond ? 'a' : 'b'\n}`).
      const span = line.slice(at) + (/[{(]\s*$/.test(line) ? ` ${src[i + 1] ?? ''}` : '');
      for (const m of span.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`\n]*)`/g)) {
        const lit = m[1] ?? m[2] ?? m[3] ?? '';
        if (!lit) continue;
        const re = lit
          .split(/\$\{[^}]*\}/)
          .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('.+');
        out.push({ re: new RegExp(`^${re}$`), sample: lit.replace(/\$\{[^}]*\}/g, 'v') });
      }
    });
  }
  return out;
}

/** A concrete id a Maestro id selector (a regex, maybe with `${VAR}`) would match. */
function sampleOf(selector: string): string {
  return selector
    .replace(/\$\{[^}]*\}/g, 'v')
    .replace(/\.[*+]/g, 'v')
    .replace(/\\(.)/g, '$1');
}

function idSelectors(file: string): string[] {
  const out: string[] = [];
  for (const l of lines(split(file).steps)) {
    const m = l.match(/^\s*(?:-\s*)?id:\s*(?:"([^"]+)"|'([^']+)'|(\S+))\s*$/);
    if (m) out.push(m[1] ?? m[2] ?? m[3]);
  }
  return out;
}

// ── the checks ───────────────────────────────────────────────────────────────

describe('Maestro flows (.maestro/)', () => {
  it('has top-level flows to run', () => {
    expect(topLevel.length).toBeGreaterThan(0);
  });

  it('clears a field by tapping its end before erasing', () => {
    const steps = lines(split(CLEAR_FIELD).steps).join('\n');
    expect(steps).toMatch(/- tapOn:\s*\n\s+id: "\$\{FIELD_ID\}"\s*\n\s+point: "\d+%,\d+%"/);
    expect(steps).toMatch(/- eraseText: \d+/);
  });

  it('passes FIELD_ID to every clear-field run', () => {
    for (const file of allFlows) {
      const steps = lines(split(file).steps).join('\n');
      const runs = steps.match(/file: (?:subflows\/)?clear-field\.yaml\s*\n\s+env:\s*\n\s+FIELD_ID:/g) ?? [];
      const all = steps.match(/clear-field\.yaml/g) ?? [];
      expect([path.relative(MAESTRO, file), runs.length]).toEqual([path.relative(MAESTRO, file), all.length]);
    }
  });

  describe.each(topLevel.map((f) => [path.basename(f), f]))('%s', (_name, file) => {
    const { header, steps } = split(file);
    const skipped = isSkipped(header);

    it('targets the app', () => {
      expect(header).toMatch(/^appId: com\.jarvis\.nodemobile\s*$/m);
    });

    it('starts from a cleared app, or is skipped with a reason', () => {
      if (skipped) {
        expect(header).toMatch(/^properties:\s*\n\s+skip_reason:\s*\S/m);
        return;
      }
      const first = lines(steps).filter((l) => l.trim() !== '').slice(0, 2).join('\n');
      expect(first).toMatch(/^- launchApp:\s*\n\s+clearState: true\s*$/);
    });
  });

  describe.each(allFlows.map((f) => [path.relative(MAESTRO, f), f]))('%s', (_name, file) => {
    it('runs only subflows that exist', () => {
      const refs = lines(split(file).steps)
        .map((l) => l.match(/^\s*(?:-\s*)?(?:runFlow|file|runScript):\s*(\S+\.(?:ya?ml|js))\s*$/))
        .filter((m): m is RegExpMatchArray => m !== null)
        .map((m) => m[1]);
      for (const ref of refs) {
        expect([ref, fs.existsSync(path.join(path.dirname(file), ref))]).toEqual([ref, true]);
      }
    });

    it('types interpolated text as one whole expression', () => {
      const mixed = lines(split(file).steps)
        .map((l) => l.match(/^\s*-\s*inputText:\s*(.*?)\s*$/))
        .filter((m): m is RegExpMatchArray => m !== null)
        .map((m) => m[1].replace(/^"(.*)"$|^'(.*)'$/, '$1$2'))
        .filter((v) => v.includes('${') && !/^\$\{[^}]*\}$/.test(v));
      expect(mixed).toEqual([]);
    });

    it('clears a field only through subflows/clear-field.yaml', () => {
      // `tapOn` taps a field's centre and `eraseText` only deletes what is before the
      // cursor, so a bare erase leaves the field's tail ("Avery HouseholdE2E").
      if (file === CLEAR_FIELD) return;
      const erases = lines(split(file).steps).filter((l) => /^\s*-\s*eraseText\b/.test(l));
      expect(erases).toEqual([]);
    });

    it('selects only testIDs that exist in the app', () => {
      const ids = sourceTestIDs();
      // Either side may be the general one: `member-role-chip-.*` against a template
      // testID, or `invite-role-${INVITE_ROLE}` against literal ones.
      // `android:id/...` are the platform's own views (an Alert's buttons).
      const missing = idSelectors(file).filter((sel) => {
        if (sel.startsWith('android:id/')) return false;
        const sample = sampleOf(sel);
        const selRe = new RegExp(`^${sel.replace(/\$\{[^}]*\}/g, '.+')}$`);
        return !ids.some((id) => id.re.test(sample) || selRe.test(id.sample));
      });
      expect(missing).toEqual([]);
    });
  });
});
