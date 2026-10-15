import { resolveSpeaksAs, speaksAsLabel } from '../../src/utils/speaksAs';

// A desktop agent's voice turns act as its signed-in member (jarvis-server cc
// device_owner.go): owner_user_id while that member is still in the node's
// household. No owner, or an owner who left, means nobody is signed in.

const members = [
  { user_id: 7, username: 'alex', display_name: 'Alex B' },
  { user_id: 8, username: 'sam', display_name: null },
  { user_id: 9, username: 'kim', display_name: '   ' },
];

describe('resolveSpeaksAs', () => {
  it('names the owner by display name', () => {
    expect(resolveSpeaksAs(7, null, members)).toEqual({ kind: 'owner', name: 'Alex B' });
  });

  it('falls back to the username when there is no display name (or a blank one)', () => {
    expect(resolveSpeaksAs(8, null, members)).toEqual({ kind: 'owner', name: 'sam' });
    expect(resolveSpeaksAs(9, null, members)).toEqual({ kind: 'owner', name: 'kim' });
  });

  it('is signed out without an owner', () => {
    expect(resolveSpeaksAs(null, null, members)).toEqual({ kind: 'signedOut' });
    expect(resolveSpeaksAs(undefined, null, null)).toEqual({ kind: 'signedOut' });
    expect(resolveSpeaksAs(0, null, null)).toEqual({ kind: 'signedOut' });
  });

  it('is signed out when the owner left the household', () => {
    expect(resolveSpeaksAs(42, null, members)).toEqual({ kind: 'signedOut' });
  });

  it('names the viewer as owner before the member list arrives', () => {
    expect(resolveSpeaksAs(7, { id: 7, email: 'a@x', username: 'alex', display_name: null }, null)).toEqual({
      kind: 'owner',
      name: 'alex',
    });
  });

  it('is unknown while the member list is missing and the owner is someone else', () => {
    expect(resolveSpeaksAs(8, { id: 7, email: 'a@x' }, null)).toEqual({ kind: 'unknown' });
  });
});

describe('speaksAsLabel', () => {
  it('reads the way the node detail shows it', () => {
    expect(speaksAsLabel({ kind: 'owner', name: 'Alex B' })).toBe('Speaks as Alex B');
    expect(speaksAsLabel({ kind: 'signedOut' })).toBe('Not signed in: sign in on the computer');
    expect(speaksAsLabel({ kind: 'unknown' })).toBeNull();
  });
});
