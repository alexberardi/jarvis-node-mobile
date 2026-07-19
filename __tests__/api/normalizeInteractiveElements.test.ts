import { normalizeInteractiveElements } from '../../src/api/commandCenterApi';

// ── Fixtures ────────────────────────────────────────────────────────────────

const el = (overrides: Record<string, unknown> = {}) => ({
  id: 'el-1',
  label: 'Call now',
  command: 'phone_demo',
  callback: 'confirm_call',
  data: { dialed_number: '' },
  ...overrides,
});

describe('normalizeInteractiveElements', () => {
  it('passes well-formed elements through unchanged', () => {
    const input = [el(), el({ id: 'el-2', label: 'Cancel', callback: 'cancel_call' })];
    const out = normalizeInteractiveElements(input);
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe('el-1');
    expect(out[1].id).toBe('el-2');
  });

  it('derives stable unique ids for id-less elements (live 2026-07-19 bug)', () => {
    // Two id-less chips previously both rendered with key=undefined, and one
    // tap marked BOTH as sent (pendingId/sentIds compare by id).
    const input = [
      el({ id: undefined }),
      el({ id: undefined, label: 'Cancel', callback: 'cancel_call' }),
    ];
    const out = normalizeInteractiveElements(input);
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe('phone_demo:confirm_call:0');
    expect(out[1].id).toBe('phone_demo:cancel_call:1');
    expect(new Set(out.map((e) => e.id)).size).toBe(2);
  });

  it('disambiguates duplicate producer ids', () => {
    const input = [el(), el({ label: 'Again' })]; // same id twice
    const out = normalizeInteractiveElements(input);
    expect(out[0].id).toBe('el-1');
    expect(out[1].id).not.toBe('el-1');
    expect(new Set(out.map((e) => e.id)).size).toBe(2);
  });

  it('drops entries missing label/command/callback and non-objects', () => {
    const input = [el(), null, 'junk', { label: 'no command' }, { command: 'x', callback: 'y' }];
    const out = normalizeInteractiveElements(input as unknown[]);
    expect(out).toHaveLength(1);
  });

  it('defaults malformed data to an empty object', () => {
    const out = normalizeInteractiveElements([el({ data: 'not-an-object' })]);
    expect(out[0].data).toEqual({});
  });

  it('returns [] for non-array metadata', () => {
    expect(normalizeInteractiveElements(undefined)).toEqual([]);
    expect(normalizeInteractiveElements({})).toEqual([]);
  });
});
