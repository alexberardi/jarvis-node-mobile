import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import { NodeUpdateSection } from '../../src/components/NodeUpdateSection';
import { lightTheme } from '../../src/theme';
import { getLatestRelease } from '../../src/api/nodeUpdateApi';
import { useSettingsSnapshot } from '../../src/hooks/useSettingsSnapshot';

// A desktop agent updates itself to follow the server's version (install plan 1.7), so it
// never gets the Pi's release comparison, Update button or allow_updates K2 push, even if it
// reported node_kind "desktop" with a Pi-like install_mode.

jest.mock('../../src/api/nodeUpdateApi', () => ({ getLatestRelease: jest.fn() }));
jest.mock('../../src/hooks/useSettingsSnapshot', () => ({ useSettingsSnapshot: jest.fn() }));
jest.mock('../../src/hooks/useNodeUpdate', () => ({
  useNodeUpdate: () => ({ task: null, error: null, loading: false, cancelling: false, rehydrating: false, trigger: jest.fn(), cancel: jest.fn() }),
}));
jest.mock('../../src/services/configPushService', () => ({ encryptAndPushConfig: jest.fn() }));

const base = { node_id: 'n1', last_seen_version: '0.1.0', household_id: 'hh-1' } as any;
const renderIt = (node: any) =>
  render(
    <PaperProvider theme={lightTheme}>
      <NodeUpdateSection node={node} />
    </PaperProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  (getLatestRelease as jest.Mock).mockResolvedValue({ version: '0.2.0' });
  (useSettingsSnapshot as jest.Mock).mockReturnValue({ snapshot: { node_config: { allow_updates: true } }, state: 'ready', refetch: jest.fn() });
});

it('offers a Pi tarball node the update', async () => {
  const { findByText, getByText } = renderIt({ ...base, install_mode: 'tarball', node_kind: null });
  expect(await findByText('Latest: 0.2.0')).toBeTruthy();
  expect(getByText('Node version')).toBeTruthy();
});

it.each([
  ['install_mode desktop-agent', { install_mode: 'desktop-agent', node_kind: 'desktop' }],
  ['node_kind desktop with a tarball install_mode', { install_mode: 'tarball', node_kind: 'desktop' }],
])('shows a desktop agent its version only (%s)', async (_label, kind) => {
  const { getByText, queryByText } = renderIt({ ...base, ...kind });
  expect(getByText('Agent version')).toBeTruthy();
  expect(getByText(/Updates itself to match the server/)).toBeTruthy();
  expect(queryByText(/desktop-agent/)).toBeNull();
  expect(queryByText('Update')).toBeNull();
  await waitFor(() => expect(getLatestRelease).not.toHaveBeenCalled());
  expect(useSettingsSnapshot).not.toHaveBeenCalled();
});
