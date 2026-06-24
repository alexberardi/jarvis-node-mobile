import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import InstallProgressScreen from '../../src/screens/Store/InstallProgressScreen';
import { lightTheme } from '../../src/theme';
import {
  pollInstallStatus,
  pollCCInstallStatus,
  requestInstall,
} from '../../src/api/packageInstallApi';
import { pollTestInstallStatus } from '../../src/api/testInstallApi';
import { useToolsVersion } from '../../src/contexts/ToolsContext';

// L1 FLOW INTEGRATION — the InstallProgressScreen polling surface (no prior
// coverage): the real screen drives a setInterval(750ms) poll loop with an
// immediate on-mount tick. We mock the leaf poll/status api fns to resolve a
// TERMINAL status (or chain pending -> completed) and assert against the REAL
// screen + real state with REAL timers — the terminal status label render, the
// pending -> completed transition, the all-terminal effect that stops polling
// AND fires invalidateTools() exactly once, the failed-card Retry path that
// calls requestInstall(...) with the exact arg shape, the cc-provider poll
// route, the empty-installs no-card case, and the back-button goBack. Only
// api/nav/context leaves are mocked.

const mockGoBack = jest.fn();
const mockPopToTop = jest.fn();

const mockNavigation = {
  goBack: mockGoBack,
  popToTop: mockPopToTop,
};

// Mutable route params — each test seeds via setRouteParams() before render.
// Prefixed `mock` so the jest.mock factory may reference it (hoist rule).
let mockRouteParams: Record<string, unknown> = {};
const setRouteParams = (params: Record<string, unknown>) => {
  mockRouteParams = params;
};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => ({ params: mockRouteParams }),
}));

jest.mock('../../src/api/packageInstallApi', () => ({
  requestInstall: jest.fn(),
  pollInstallStatus: jest.fn(),
  pollCCInstallStatus: jest.fn(),
}));

jest.mock('../../src/api/testInstallApi', () => ({
  pollTestInstallStatus: jest.fn(),
}));

const mockInvalidateTools = jest.fn();
jest.mock('../../src/contexts/ToolsContext', () => ({
  useToolsVersion: jest.fn(),
}));

// Two-node install payload for the standard (store) mode. The screen casts
// route.params.installs (parsed JSON) directly to InstallEntry[].
const TWO_INSTALLS = [
  { requestId: 'req-A', nodeId: 'node-1', nodeName: 'Kitchen' },
  { requestId: 'req-B', nodeId: 'node-2', nodeName: 'Bedroom' },
];

const ONE_INSTALL = [{ requestId: 'req-A', nodeId: 'node-1', nodeName: 'Kitchen' }];

const statusOf = (
  requestId: string,
  status: string,
  errorMessage: string | null = null,
) => ({
  status,
  request_id: requestId,
  command_name: 'cool-package',
  error_message: errorMessage,
  details: null,
});

const renderScreen = () =>
  render(
    <PaperProvider theme={lightTheme}>
      <InstallProgressScreen />
    </PaperProvider>,
  );

describe('InstallProgress — flow integration (poll loop, terminal stop + invalidateTools, retry, cc-provider, empty)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useToolsVersion as jest.Mock).mockReturnValue({
      toolsVersion: 0,
      invalidateTools: mockInvalidateTools,
    });
    // Quiet the consecutive-failure console.error path.
    jest.spyOn(console, 'error').mockImplementation(() => {});
    setRouteParams({
      installs: JSON.stringify(ONE_INSTALL),
      packageName: 'Cool Package',
      commandName: 'cool-package',
      githubRepoUrl: 'https://github.com/x/cool',
      gitTag: 'v1.0.0',
      mode: 'store',
    });
  });

  afterEach(() => {
    (console.error as jest.Mock).mockRestore();
  });

  it('renders a card per install on the immediate on-mount poll and shows the completed label', async () => {
    setRouteParams({
      installs: JSON.stringify(TWO_INSTALLS),
      packageName: 'Cool Package',
      commandName: 'cool-package',
      githubRepoUrl: 'https://github.com/x/cool',
      gitTag: 'v1.0.0',
      mode: 'store',
    });
    (pollInstallStatus as jest.Mock).mockImplementation(async (_node: string, requestId: string) =>
      statusOf(requestId, 'completed'),
    );

    const utils = renderScreen();

    // One card per install entry, keyed by requestId.
    await waitFor(() => {
      expect(utils.getByTestId('install-progress-card-req-A')).toBeTruthy();
      expect(utils.getByTestId('install-progress-card-req-B')).toBeTruthy();
    });

    // The terminal status label renders for both.
    await waitFor(
      () => {
        expect(utils.getByTestId('install-progress-status-label-req-A').props.children).toBe(
          'Installed successfully',
        );
        expect(utils.getByTestId('install-progress-status-label-req-B').props.children).toBe(
          'Installed successfully',
        );
      },
      { timeout: 8000 },
    );

    // poll was called per node with (nodeId, requestId).
    expect(pollInstallStatus).toHaveBeenCalledWith('node-1', 'req-A');
    expect(pollInstallStatus).toHaveBeenCalledWith('node-2', 'req-B');
  });

  it('drives the pending -> completed transition then stops polling + invalidateTools() exactly once', async () => {
    // First tick: pending. Subsequent ticks: completed.
    (pollInstallStatus as jest.Mock)
      .mockResolvedValueOnce(statusOf('req-A', 'pending'))
      .mockResolvedValue(statusOf('req-A', 'completed'));

    const utils = renderScreen();

    // The pending label lands from the immediate poll.
    await waitFor(() =>
      expect(utils.getByTestId('install-progress-status-label-req-A').props.children).toBe(
        'Installing...',
      ),
    );

    // The next interval tick flips it to completed (terminal).
    await waitFor(
      () =>
        expect(utils.getByTestId('install-progress-status-label-req-A').props.children).toBe(
          'Installed successfully',
        ),
      { timeout: 8000 },
    );

    // All terminal → tools invalidated exactly once.
    await waitFor(() => expect(mockInvalidateTools).toHaveBeenCalledTimes(1));

    // Footer reads "Done" (allDone) and the check-status button is absent (no pollError).
    expect(utils.getByTestId('install-progress-done-button')).toBeTruthy();
    expect(utils.getByText('Done')).toBeTruthy();
    expect(utils.queryByTestId('install-progress-check-status-button')).toBeNull();

    // Polling has stopped: clear the call count, wait past several intervals,
    // and confirm no further poll fires (the interval was cleared).
    (pollInstallStatus as jest.Mock).mockClear();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1800));
    });
    expect(pollInstallStatus).not.toHaveBeenCalled();
  });

  it('renders the failed error_message label and exposes the per-card Retry button', async () => {
    (pollInstallStatus as jest.Mock).mockResolvedValue(
      statusOf('req-A', 'failed', 'disk full'),
    );

    const utils = renderScreen();

    await waitFor(
      () =>
        expect(utils.getByTestId('install-progress-status-label-req-A').props.children).toBe(
          'disk full',
        ),
      { timeout: 8000 },
    );

    // Failed is terminal → invalidateTools fired, and the footer is up.
    await waitFor(() => expect(mockInvalidateTools).toHaveBeenCalled());
    expect(utils.getByTestId('install-progress-retry-button-req-A')).toBeTruthy();
  });

  it('Retry calls requestInstall(nodeId, commandName, repoUrl, gitTag) with the exact shape and re-keys the card', async () => {
    (pollInstallStatus as jest.Mock).mockResolvedValue(
      statusOf('req-A', 'failed', 'node offline'),
    );
    // Retry yields a brand-new request id → the card re-keys to it.
    (requestInstall as jest.Mock).mockResolvedValue({
      id: 'req-A2',
      status: 'pending',
      created_at: '2026-06-23T00:00:00Z',
    });

    const utils = renderScreen();

    const retryBtn = await waitFor(
      () => utils.getByTestId('install-progress-retry-button-req-A'),
      { timeout: 8000 },
    );

    // Make the resumed poll loop reach terminal immediately so the test exits clean.
    (pollInstallStatus as jest.Mock).mockResolvedValue(statusOf('req-A2', 'completed'));

    await act(async () => {
      fireEvent.press(retryBtn);
    });

    expect(requestInstall).toHaveBeenCalledWith(
      'node-1',
      'cool-package',
      'https://github.com/x/cool',
      'v1.0.0',
    );

    // The card re-keys to the new request id returned by requestInstall.
    await waitFor(
      () => expect(utils.getByTestId('install-progress-card-req-A2')).toBeTruthy(),
      { timeout: 8000 },
    );
  });

  it('cc-provider mode polls CC directly (single Command Center card) and ignores node/test pollers', async () => {
    setRouteParams({
      // cc-provider parses the FIRST element as a bare request id string.
      installs: JSON.stringify(['cc-req-1']),
      packageName: 'Prompt Provider',
      commandName: 'prompt-provider',
      githubRepoUrl: 'https://github.com/x/pp',
      gitTag: null,
      mode: 'cc-provider',
    });
    (pollCCInstallStatus as jest.Mock).mockResolvedValue(statusOf('cc-req-1', 'completed'));

    const utils = renderScreen();

    await waitFor(
      () =>
        expect(utils.getByTestId('install-progress-status-label-cc-req-1').props.children).toBe(
          'Installed successfully',
        ),
      { timeout: 8000 },
    );

    expect(utils.getByText('Command Center')).toBeTruthy();
    expect(pollCCInstallStatus).toHaveBeenCalledWith('cc-req-1');
    expect(pollInstallStatus).not.toHaveBeenCalled();
    expect(pollTestInstallStatus).not.toHaveBeenCalled();
  });

  it('test mode routes polling through pollTestInstallStatus(nodeId, requestId)', async () => {
    setRouteParams({
      installs: JSON.stringify(ONE_INSTALL),
      packageName: 'Forge Draft',
      commandName: 'forge-draft',
      githubRepoUrl: '',
      gitTag: null,
      mode: 'test',
    });
    (pollTestInstallStatus as jest.Mock).mockResolvedValue(statusOf('req-A', 'completed'));

    const utils = renderScreen();

    await waitFor(
      () =>
        expect(utils.getByTestId('install-progress-status-label-req-A').props.children).toBe(
          'Installed successfully',
        ),
      { timeout: 8000 },
    );

    expect(pollTestInstallStatus).toHaveBeenCalledWith('node-1', 'req-A');
    expect(pollInstallStatus).not.toHaveBeenCalled();
    // Test mode never shows a Retry button even on a terminal card.
    expect(utils.queryByTestId('install-progress-retry-button-req-A')).toBeNull();
  });

  it('renders no install cards for an empty installs payload and the back button calls goBack', async () => {
    setRouteParams({
      installs: JSON.stringify([]),
      packageName: 'Nothing',
      commandName: 'nothing',
      githubRepoUrl: '',
      gitTag: null,
      mode: 'store',
    });

    const utils = renderScreen();

    // No cards, no poll calls (nothing to poll).
    await waitFor(() => expect(utils.getByTestId('install-progress-back-button')).toBeTruthy());
    expect(utils.queryByTestId('install-progress-card-req-A')).toBeNull();
    expect(pollInstallStatus).not.toHaveBeenCalled();

    fireEvent.press(utils.getByTestId('install-progress-back-button'));
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });
});
