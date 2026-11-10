import { buildSyncPushes } from '../../src/services/syncPushes';

// Sync to other nodes sends `settings:secrets` config pushes. The node files a
// push WITH __user_id__ entirely as that user's personal secrets, and one
// without it under each key's own scope (else "integration") — the Python
// node's _dispatch_secrets and the agent's applySecrets alike. So a selection
// that mixes shared and personal secrets must go out as two pushes.

const secret = (key: string, scope: string) => ({ key, scope });

describe('buildSyncPushes', () => {
  it('splits a mixed selection: shared keys untagged, personal keys tagged with the user', () => {
    const pushes = buildSyncPushes(
      [secret('HA_URL', 'integration'), secret('HA_TOKEN', 'integration'), secret('CAL_PASSWORD', 'user')],
      { HA_URL: 'http://ha', HA_TOKEN: 'tok', CAL_PASSWORD: 'pw' },
      7,
    );
    expect(pushes).toEqual([
      { HA_URL: 'http://ha', HA_TOKEN: 'tok' },
      { CAL_PASSWORD: 'pw', __user_id__: '7' },
    ]);
  });

  it('sends one untagged push when nothing is personal', () => {
    expect(buildSyncPushes([secret('A', 'integration')], { A: '1' }, 7)).toEqual([{ A: '1' }]);
  });

  it('sends one tagged push when everything is personal', () => {
    expect(buildSyncPushes([secret('P', 'user')], { P: 'x' }, 7)).toEqual([{ P: 'x', __user_id__: '7' }]);
  });

  it('treats any non-user scope (or none) as shared', () => {
    expect(
      buildSyncPushes([secret('N', 'node'), { key: 'Q' } as any], { N: 'n', Q: 'q' }, 7),
    ).toEqual([{ N: 'n', Q: 'q' }]);
  });

  it('leaves out keys with no value', () => {
    expect(
      buildSyncPushes([secret('A', 'integration'), secret('P', 'user')], { A: '1' }, 7),
    ).toEqual([{ A: '1' }]);
    expect(buildSyncPushes([secret('A', 'integration')], {}, 7)).toEqual([]);
  });

  it('drops personal secrets when there is no signed-in user, rather than filing them as shared', () => {
    expect(
      buildSyncPushes([secret('A', 'integration'), secret('P', 'user')], { A: '1', P: 'x' }, null),
    ).toEqual([{ A: '1' }]);
  });
});
