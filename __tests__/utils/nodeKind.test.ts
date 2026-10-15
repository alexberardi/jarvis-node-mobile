import {
  canSignOutDesktopAgent,
  computerCanRun,
  isDesktopAgent,
  nodeDisplayName,
  nodeKindIcon,
  nodeKindLabel,
  sortPisFirst,
  withKnownKind,
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

describe('sortPisFirst', () => {
  const kinds: Record<string, { node_kind?: string | null; install_mode?: string | null }> = {
    mac: { node_kind: 'desktop' },
    oldmac: { install_mode: 'desktop-agent' },
    pi1: { node_kind: null },
  };
  const kindOf = (n: { node_id: string }) => kinds[n.node_id];

  it('puts Pis before computers and keeps each group in its original order', () => {
    const nodes = ['mac', 'pi1', 'oldmac', 'pi2'].map((node_id) => ({ node_id }));
    expect(sortPisFirst(nodes, kindOf).map((n) => n.node_id)).toEqual(['pi1', 'pi2', 'mac', 'oldmac']);
  });

  it('treats a node with unknown kind as a Pi and leaves the input alone', () => {
    const nodes = [{ node_id: 'x' }, { node_id: 'y' }];
    const sorted = sortPisFirst(nodes, () => undefined);
    expect(sorted.map((n) => n.node_id)).toEqual(['x', 'y']);
    expect(sorted).not.toBe(nodes);
  });
});

describe('computerCanRun', () => {
  it('allows a package that declares no targets (jarvis-server decision 2026-10-15)', () => {
    expect(computerCanRun({})).toBe(true);
    expect(computerCanRun({ targets: [] })).toBe(true);
    expect(computerCanRun(null)).toBe(true);
    expect(computerCanRun(undefined)).toBe(true);
  });

  it('allows a package whose targets include desktop', () => {
    expect(computerCanRun({ targets: ['desktop'] })).toBe(true);
    expect(computerCanRun({ targets: ['node', 'desktop'] })).toBe(true);
  });

  it('refuses a package whose targets leave out desktop', () => {
    expect(computerCanRun({ targets: ['node'] })).toBe(false);
  });

  it('refuses a package that needs Pi system setup', () => {
    expect(computerCanRun({ apt_packages: ['mpv'] })).toBe(false);
    expect(computerCanRun({ apt_sources: [{ name: 'x' }] })).toBe(false);
    expect(computerCanRun({ post_install: [{ op: 'x' }] })).toBe(false);
    expect(computerCanRun({ apt_packages: [], apt_sources: [], post_install: [] })).toBe(true);
  });

  it('ignores a malformed targets field rather than guessing', () => {
    expect(computerCanRun({ targets: 'node' })).toBe(true);
  });
});

describe('nodeDisplayName', () => {
  const id = 'abcdef1234567890';

  it('names a computer by its registered name', () => {
    expect(nodeDisplayName({ node_id: id, room: 'desktop', name: 'omarchy', node_kind: 'desktop' })).toBe('omarchy');
    expect(
      nodeDisplayName({ node_id: id, room: 'desktop', name: ' laptop ', install_mode: 'desktop-agent' }),
    ).toBe('laptop');
  });

  it('falls back to the room, then the short id, for a computer without a name', () => {
    expect(nodeDisplayName({ node_id: id, room: 'desktop', name: null, node_kind: 'desktop' })).toBe('desktop');
    expect(nodeDisplayName({ node_id: id, room: '', name: '  ', node_kind: 'desktop' })).toBe('abcdef12');
  });

  it('keeps the room for a Pi even when it has a name', () => {
    expect(nodeDisplayName({ node_id: id, room: 'kitchen', name: 'pi-zero-1' })).toBe('kitchen');
    expect(nodeDisplayName({ node_id: id, room: null, name: 'pi-zero-1', node_kind: null })).toBe('abcdef12');
  });

  it('uses the caller fallback instead of the short id when given', () => {
    expect(nodeDisplayName({ node_id: id, room: null }, 'This computer')).toBe('This computer');
    expect(nodeDisplayName({ node_id: id, room: 'den' }, 'This computer')).toBe('den');
  });
});

describe('withKnownKind', () => {
  it('fills kind and name the node lacks from the household node list', () => {
    const n = withKnownKind({ node_id: 'd1', room: 'desktop' }, { node_kind: 'desktop', name: 'omarchy' });
    expect(nodeDisplayName(n)).toBe('omarchy');
  });

  it("keeps the node's own fields and copes with no entry", () => {
    expect(withKnownKind({ node_id: 'p1', room: 'kitchen', node_kind: null, name: 'x' }, undefined)).toEqual({
      node_id: 'p1', room: 'kitchen', node_kind: null, install_mode: undefined, name: 'x',
    });
    expect(withKnownKind({ node_id: 'd1', node_kind: 'desktop', name: 'own' }, { name: 'list' }).name).toBe('own');
  });
});
