import type { InstalledPackage } from '../../src/api/chatApi';
import type { InstallStatusValue } from '../../src/types/Package';
import {
  anyHealthFailed,
  configErrorBadge,
  getRevertTarget,
  installStatusLabel,
  isTerminalInstallStatus,
  needsSetupLabel,
} from '../../src/utils/packageStatus';

// ── Fixtures ────────────────────────────────────────────────────────────────

const pkg = (overrides: Partial<InstalledPackage> = {}): InstalledPackage => ({
  name: 'email',
  version: '1.0.2',
  ...overrides,
});

// ── Status mapping ──────────────────────────────────────────────────────────

describe('isTerminalInstallStatus', () => {
  it.each<[InstallStatusValue, boolean]>([
    ['pending', false],
    ['restarting', false],
    ['completed', true],
    ['failed', true],
    ['expired', true],
  ])('%s → terminal=%s', (status, expected) => {
    expect(isTerminalInstallStatus(status)).toBe(expected);
  });
});

describe('installStatusLabel', () => {
  it('maps each status to its row label', () => {
    expect(installStatusLabel('pending', false)).toBe('Installing...');
    expect(installStatusLabel('restarting', false)).toBe('Restarting node…');
    expect(installStatusLabel('completed', false)).toBe('Installed successfully');
    expect(installStatusLabel('failed', false, 'boom')).toBe('boom');
    expect(installStatusLabel('failed', false)).toBe('Installation failed');
    expect(installStatusLabel('expired', false)).toBe(
      'Request timed out — node may be offline',
    );
  });

  it('shows Status unknown for non-terminal states while polling is broken', () => {
    expect(installStatusLabel('pending', true)).toBe('Status unknown');
    expect(installStatusLabel('restarting', true)).toBe('Status unknown');
    // Terminal states keep their label even with a poll error.
    expect(installStatusLabel('completed', true)).toBe('Installed successfully');
  });
});

// ── Badge selection ─────────────────────────────────────────────────────────

describe('configErrorBadge', () => {
  it('returns null for missing or empty errors', () => {
    expect(configErrorBadge(undefined)).toBeNull();
    expect(configErrorBadge([])).toBeNull();
  });

  it('labels import_failed tags as Failed to load', () => {
    expect(configErrorBadge(['import_failed: cannot import name JarvisInbox'])).toEqual({
      label: 'Failed to load',
      importFailed: true,
    });
  });

  it('prefers Failed to load when import_failed appears among field tags', () => {
    const badge = configErrorBadge(['required_secrets', 'import_failed: boom']);
    expect(badge).toEqual({ label: 'Failed to load', importFailed: true });
  });

  it('keeps the configuration-error label for field-level tags', () => {
    expect(configErrorBadge(['required_secrets', 'parameters'])).toEqual({
      label: 'Configuration error: required_secrets, parameters',
      importFailed: false,
    });
  });

  it('truncates to three tags with an ellipsis', () => {
    const badge = configErrorBadge(['a', 'b', 'c', 'd']);
    expect(badge?.label).toBe('Configuration error: a, b, c…');
  });
});

describe('needsSetupLabel', () => {
  it('falls back to a plain label without missing secrets', () => {
    expect(needsSetupLabel(undefined)).toBe('Needs setup');
    expect(needsSetupLabel([])).toBe('Needs setup');
  });

  it('lists the missing secret keys', () => {
    expect(needsSetupLabel(['EMAIL_ADDRESS', 'EMAIL_PASSWORD'])).toBe(
      'Needs setup — missing EMAIL_ADDRESS, EMAIL_PASSWORD',
    );
  });
});

// ── Revert target + health aggregation ──────────────────────────────────────

describe('getRevertTarget', () => {
  it('returns null when no node carries a previous_version', () => {
    expect(getRevertTarget({})).toBeNull();
    expect(getRevertTarget({ n1: pkg(), n2: null, n3: undefined })).toBeNull();
    expect(getRevertTarget({ n1: pkg({ previous_version: null }) })).toBeNull();
  });

  it('collects only the nodes with a previous_version', () => {
    const target = getRevertTarget({
      n1: pkg({ previous_version: '1.0.1' }),
      n2: pkg(),
      n3: null,
    });
    expect(target).toEqual({ nodeIds: ['n1'], previousVersion: '1.0.1' });
  });

  it('labels with the newest previous version when nodes disagree', () => {
    const target = getRevertTarget({
      n1: pkg({ previous_version: '1.0.1' }),
      n2: pkg({ previous_version: '1.0.10' }),
    });
    expect(target).toEqual({ nodeIds: ['n1', 'n2'], previousVersion: '1.0.10' });
  });
});

describe('anyHealthFailed', () => {
  it('is false with no packages or healthy/unreported packages', () => {
    expect(anyHealthFailed({})).toBe(false);
    expect(anyHealthFailed({ n1: pkg(), n2: pkg({ health: 'ok' }), n3: null })).toBe(false);
  });

  it('is true when any node reports failed health', () => {
    expect(anyHealthFailed({ n1: pkg({ health: 'ok' }), n2: pkg({ health: 'failed' }) })).toBe(
      true,
    );
  });
});
