import { anyUpdate, installLabel, nodePackageState } from '../../src/utils/packageNodes';

describe('package state per node', () => {
  it('reads installed, update, install and locked', () => {
    expect(nodePackageState('1.2.0', '1.2.0')).toBe('installed');
    expect(nodePackageState('1.3.0', '1.2.0')).toBe('installed');
    expect(nodePackageState('1.1.0', '1.2.0')).toBe('update');
    expect(nodePackageState('unknown', '1.2.0')).toBe('update');
    expect(nodePackageState(null, '1.2.0')).toBe('install');
    expect(nodePackageState('1.1.0', '1.2.0', 'From another store')).toBe('locked');
  });

  it('spots updates across nodes', () => {
    expect(anyUpdate(['1.2.0', null], '1.2.0')).toBe(false);
    expect(anyUpdate(['1.1.0', null], '1.2.0')).toBe(true);
    expect(anyUpdate(['unknown'], '1.2.0')).toBe(false);
  });

  it('says what the button will do', () => {
    expect(installLabel([], [])).toBe('Choose nodes');
    expect(installLabel(['Living room'], ['Office'])).toBe('Install on Living room · Update Office');
    expect(installLabel(['A', 'B'], [])).toBe('Install on A and B');
    expect(installLabel(['A', 'B', 'C'], [])).toBe('Install on 3 nodes');
    expect(installLabel([], ['Office'])).toBe('Update Office');
  });
});
