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

describe('release comparison (#496)', () => {
  const goNode = { ...base, install_mode: 'tarball', node_kind: null, last_seen_version: '0.1.0-rc18' };

  it('asks for the release of this node', async () => {
    renderIt(goNode);
    await waitFor(() => expect(getLatestRelease).toHaveBeenCalledWith('n1'));
  });

  it.each(['0.1.0-rc19', '0.1.0'])('offers a Go node at 0.1.0-rc18 the newer %s', async (version) => {
    (getLatestRelease as jest.Mock).mockResolvedValue({ version, kind: 'go' });
    const { findByText, getByText } = renderIt(goNode);
    expect(await findByText(`Latest: ${version}`)).toBeTruthy();
    expect(getByText('Update')).toBeTruthy();
  });

  it.each(['0.1.0-rc18', '0.1.0-rc17', '0.0.9'])('never offers %s to a node at 0.1.0-rc18', async (version) => {
    (getLatestRelease as jest.Mock).mockResolvedValue({ version, kind: 'go' });
    const { queryByText } = renderIt(goNode);
    await waitFor(() => expect(getLatestRelease).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(queryByText(/Latest:/)).toBeNull();
    expect(queryByText('Update')).toBeNull();
  });

  it('offers nothing when the server returns no release', async () => {
    (getLatestRelease as jest.Mock).mockResolvedValue(null);
    const { queryByText } = renderIt(goNode);
    await waitFor(() => expect(getLatestRelease).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(queryByText(/Latest:/)).toBeNull();
    expect(queryByText('Update')).toBeNull();
  });

  it('does not offer 0.3.6 to a Go node at 0.1.0-rc18 (the server answers with the Go release)', async () => {
    // The server picks the release by the node's kind; a Python node's 0.3.6
    // never comes back for a Go node's id.
    (getLatestRelease as jest.Mock).mockImplementation(async (nodeId: string) =>
      nodeId === 'n1' ? { version: '0.1.0-rc18', kind: 'go' } : { version: '0.3.6', kind: 'python' },
    );
    const { queryByText } = renderIt(goNode);
    await waitFor(() => expect(getLatestRelease).toHaveBeenCalledWith('n1'));
    await new Promise((r) => setTimeout(r, 0));
    expect(queryByText(/0\.3\.6/)).toBeNull();
    expect(queryByText('Update')).toBeNull();
  });
});
