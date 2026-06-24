import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import NodePickerSheet from '../../src/screens/Store/NodePickerSheet';
import { lightTheme } from '../../src/theme';
import { requestInstall } from '../../src/api/packageInstallApi';

// L1 FLOW INTEGRATION — the Store node-picker sheet (no prior coverage): the
// per-node state classification (not-installed / outdated / up-to-date via
// compareSemver), the default selection of every actionable node, the
// up-to-date lockout (no checkbox, tap is a no-op), per-node deselect via the
// checkbox, the install fan-out (requestInstall per selected node with exact
// args) → navigation.replace('InstallProgress', {serialized installs}), the
// empty-selection disabled gate, the install-error Alert, and back→goBack.
// Real screen + real selection state; nav comes via hooks (mocked), and only
// the packageInstallApi leaf + Alert are stubbed.

const mockReplace = jest.fn();
const mockGoBack = jest.fn();
let mockRouteParams: any;

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ replace: mockReplace, goBack: mockGoBack }),
  useRoute: () => ({ params: mockRouteParams }),
}));

jest.mock('../../src/api/packageInstallApi', () => ({
  requestInstall: jest.fn(),
}));

const installMock = requestInstall as jest.Mock;

// Three nodes covering each state:
//  - kitchen:  not-installed   → actionable, default-selected
//  - living:   outdated (v1.0) → actionable, default-selected
//  - bedroom:  up-to-date (v2.0) → locked, NOT selected
const NODES = [
  { node_id: 'kitchen-aaaaaaaa', room: 'Kitchen' },
  { node_id: 'living-bbbbbbbb', room: 'Living Room' },
  { node_id: 'bedroom-cccccccc', room: 'Bedroom' },
];

const INSTALLED_VERSIONS: Record<string, string | null> = {
  // kitchen absent → not-installed
  'living-bbbbbbbb': '1.0.0', // < latest 2.0.0 → outdated
  'bedroom-cccccccc': '2.0.0', // == latest → up-to-date
};

const baseParams = () => ({
  nodes: JSON.stringify(NODES),
  installedVersions: JSON.stringify(INSTALLED_VERSIONS),
  commandName: 'weather',
  githubRepoUrl: 'https://github.com/acme/weather',
  gitTag: 'v2.0.0',
  latestVersion: '2.0.0',
  packageName: 'Weather',
  installedNodeIds: JSON.stringify(['living-bbbbbbbb', 'bedroom-cccccccc']),
});

const renderScreen = (params: any = baseParams()) => {
  mockRouteParams = params;
  return render(
    <PaperProvider theme={lightTheme}>
      <NodePickerSheet />
    </PaperProvider>,
  );
};

describe('NodePicker sheet — flow integration (select, lockout, install fan-out, errors)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // requestInstall echoes a request id per node so the navigation payload is asserted.
    installMock.mockImplementation((nodeId: string) =>
      Promise.resolve({ id: `req-${nodeId}`, status: 'pending', created_at: 'now' }),
    );
  });

  it('renders the node rows and defaults the action label to the two actionable nodes', () => {
    const { getByText } = renderScreen();

    expect(getByText('Kitchen')).toBeTruthy();
    expect(getByText('Living Room')).toBeTruthy();
    expect(getByText('Bedroom')).toBeTruthy();

    // kitchen (install) + living (update) are pre-selected → mixed label, count 2.
    expect(getByText('Install / Update on 2 nodes')).toBeTruthy();
    // up-to-date node advertises its locked status in the description.
    expect(getByText('Installed v2.0.0 — up to date')).toBeTruthy();
  });

  it('up-to-date node is locked: no checkbox, and tapping its row does not select it', () => {
    const { queryByTestId, getByTestId, getByText } = renderScreen();

    // Locked node renders the check icon instead of a checkbox.
    expect(queryByTestId('node-picker-checkbox-bedroom-cccccccc')).toBeNull();
    // Actionable nodes do render checkboxes.
    expect(getByTestId('node-picker-checkbox-kitchen-aaaaaaaa')).toBeTruthy();

    // Tapping the locked row is a no-op — selection count stays at 2.
    fireEvent.press(getByTestId('node-picker-list-item-bedroom-cccccccc'));
    expect(getByText('Install / Update on 2 nodes')).toBeTruthy();
  });

  it('install: fans out requestInstall per selected node then replace→InstallProgress', async () => {
    const { getByTestId } = renderScreen();

    await act(async () => {
      fireEvent.press(getByTestId('node-picker-install-button'));
    });

    expect(installMock).toHaveBeenCalledTimes(2);
    expect(installMock).toHaveBeenCalledWith(
      'kitchen-aaaaaaaa',
      'weather',
      'https://github.com/acme/weather',
      'v2.0.0',
    );
    expect(installMock).toHaveBeenCalledWith(
      'living-bbbbbbbb',
      'weather',
      'https://github.com/acme/weather',
      'v2.0.0',
    );

    await waitFor(() => expect(mockReplace).toHaveBeenCalledTimes(1));
    const [target, params] = mockReplace.mock.calls[0];
    expect(target).toBe('InstallProgress');
    expect(params).toEqual(
      expect.objectContaining({
        packageName: 'Weather',
        commandName: 'weather',
        githubRepoUrl: 'https://github.com/acme/weather',
        gitTag: 'v2.0.0',
      }),
    );
    // installs is a JSON string of {requestId, nodeId, nodeName} entries.
    const installs = JSON.parse(params.installs);
    expect(installs).toEqual(
      expect.arrayContaining([
        { requestId: 'req-kitchen-aaaaaaaa', nodeId: 'kitchen-aaaaaaaa', nodeName: 'Kitchen' },
        { requestId: 'req-living-bbbbbbbb', nodeId: 'living-bbbbbbbb', nodeName: 'Living Room' },
      ]),
    );
  });

  it('deselecting a node via its checkbox installs only the remaining one', async () => {
    const { getByTestId, getByText } = renderScreen();

    // Deselect the not-installed kitchen node, leaving only the outdated living node.
    fireEvent.press(getByTestId('node-picker-checkbox-kitchen-aaaaaaaa'));
    // Label collapses to the update-only, single-node form.
    await waitFor(() => expect(getByText('Update on 1 node')).toBeTruthy());

    await act(async () => {
      fireEvent.press(getByTestId('node-picker-install-button'));
    });

    expect(installMock).toHaveBeenCalledTimes(1);
    expect(installMock).toHaveBeenCalledWith(
      'living-bbbbbbbb',
      'weather',
      'https://github.com/acme/weather',
      'v2.0.0',
    );
  });

  it('empty selection disables the install button and never calls the api', async () => {
    const { getByTestId, getByText } = renderScreen();

    // Deselect both actionable nodes.
    fireEvent.press(getByTestId('node-picker-checkbox-kitchen-aaaaaaaa'));
    fireEvent.press(getByTestId('node-picker-checkbox-living-bbbbbbbb'));

    await waitFor(() => expect(getByText('Select nodes')).toBeTruthy());
    expect(getByTestId('node-picker-install-button').props.accessibilityState?.disabled).toBe(true);

    // A press is a guarded no-op even if the disabled state were bypassed.
    await act(async () => {
      fireEvent.press(getByTestId('node-picker-install-button'));
    });
    expect(installMock).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('shows an Install Error alert and does not navigate when requestInstall throws', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    installMock.mockRejectedValueOnce(new Error('node offline'));
    const { getByTestId } = renderScreen();

    await act(async () => {
      fireEvent.press(getByTestId('node-picker-install-button'));
    });

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith('Install Error', 'node offline'),
    );
    expect(mockReplace).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('back button calls navigation.goBack', () => {
    const { getByTestId } = renderScreen();

    fireEvent.press(getByTestId('node-picker-back-button'));

    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });
});
