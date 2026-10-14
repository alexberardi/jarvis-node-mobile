import {
  canSignOutDesktopAgent,
  isDesktopAgent,
  nodeKindIcon,
  nodeKindLabel,
} from '../../src/utils/nodeKind';

describe('isDesktopAgent', () => {
  it('trusts node_kind first', () => {
    expect(isDesktopAgent({ node_kind: 'desktop' })).toBe(true);
    expect(isDesktopAgent({ node_kind: 'desktop', install_mode: 'tarball' })).toBe(true);
  });

  it('falls back to install_mode desktop-agent when node_kind is missing', () => {
    expect(isDesktopAgent({ install_mode: 'desktop-agent' })).toBe(true);
    expect(isDesktopAgent({ node_kind: null, install_mode: 'desktop-agent' })).toBe(true);
  });

  it('is false for Pi nodes, docker nodes and nodes that report nothing', () => {
    expect(isDesktopAgent({ node_kind: 'pi', install_mode: 'tarball' })).toBe(false);
    expect(isDesktopAgent({ install_mode: 'docker' })).toBe(false);
    expect(isDesktopAgent({})).toBe(false);
    expect(isDesktopAgent(null)).toBe(false);
    expect(isDesktopAgent(undefined)).toBe(false);
  });
});

describe('nodeKindIcon / nodeKindLabel', () => {
  it('uses the robot for a desktop agent and the Raspberry Pi for everything else', () => {
    expect(nodeKindIcon({ node_kind: 'desktop' })).toBe('robot');
    expect(nodeKindIcon({ install_mode: 'desktop-agent' })).toBe('robot');
    expect(nodeKindIcon({ install_mode: 'tarball' })).toBe('raspberry-pi');
    expect(nodeKindIcon(undefined)).toBe('raspberry-pi');
  });

  it('names the kind for accessibility', () => {
    expect(nodeKindLabel({ node_kind: 'desktop' })).toBe('Computer');
    expect(nodeKindLabel({ install_mode: 'tarball' })).toBe('Raspberry Pi');
  });
});

describe('canSignOutDesktopAgent (mirrors cc canSignOut)', () => {
  const households = [
    { id: 'hh-1', role: 'member' as const },
    { id: 'hh-2', role: 'admin' as const },
    { id: 'hh-3', role: 'power_user' as const },
  ];
  const node = (household_id: string | null, owner_user_id: number | null) => ({
    node_kind: 'desktop',
    household_id,
    owner_user_id,
  });

  it('lets the member who paired it sign it out', () => {
    expect(canSignOutDesktopAgent(node('hh-1', 7), 7, households)).toBe(true);
  });

  it('lets a household admin sign out anyone\'s computer', () => {
    expect(canSignOutDesktopAgent(node('hh-2', 99), 7, households)).toBe(true);
    expect(canSignOutDesktopAgent(node('hh-2', null), 7, households)).toBe(true);
  });

  it('refuses another member and a power user who did not pair it', () => {
    expect(canSignOutDesktopAgent(node('hh-1', 99), 7, households)).toBe(false);
    expect(canSignOutDesktopAgent(node('hh-3', 99), 7, households)).toBe(false);
    expect(canSignOutDesktopAgent(node('hh-1', null), 7, households)).toBe(false);
  });

  it('refuses an owner who is no longer a member of the household', () => {
    expect(canSignOutDesktopAgent(node('hh-gone', 7), 7, households)).toBe(false);
  });

  it('refuses without a signed-in user or a household', () => {
    expect(canSignOutDesktopAgent(node('hh-1', 7), null, households)).toBe(false);
    expect(canSignOutDesktopAgent(node(null, 7), 7, households)).toBe(false);
  });
});
