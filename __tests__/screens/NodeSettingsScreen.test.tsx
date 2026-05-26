import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import NodeSettingsScreen from '../../src/screens/Nodes/NodeSettingsScreen';
import { lightTheme } from '../../src/theme';

// --- Navigation mocks ---
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockRouteParams = { nodeId: 'node-abc', room: 'kitchen' };

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
  useRoute: () => ({ params: mockRouteParams }),
  useFocusEffect: jest.fn(),
}));

// --- Auth ---
jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({
    state: {
      accessToken: 'mock-token',
      activeHouseholdId: 'hh-1',
      user: { id: 7 },
    },
  }),
}));

// --- K2 service ---
const mockHasK2 = jest.fn();
const mockGetK2 = jest.fn();
jest.mock('../../src/services/k2Service', () => ({
  hasK2: (...args: unknown[]) => mockHasK2(...args),
  getK2: (...args: unknown[]) => mockGetK2(...args),
  generateK2: jest.fn(),
  storeK2: jest.fn(),
}));

// --- Settings snapshot APIs ---
const mockRequestSettingsSnapshot = jest.fn();
const mockPollSettingsResult = jest.fn();
const mockProvisionK2 = jest.fn();
jest.mock('../../src/api/nodeSettingsApi', () => ({
  requestSettingsSnapshot: (...args: unknown[]) => mockRequestSettingsSnapshot(...args),
  pollSettingsResult: (...args: unknown[]) => mockPollSettingsResult(...args),
  provisionK2ToNode: (...args: unknown[]) => mockProvisionK2(...args),
}));

// --- Snapshot decrypt ---
const mockDecryptSettingsSnapshot = jest.fn();
jest.mock('../../src/services/settingsDecryptService', () => {
  const actual = jest.requireActual('../../src/services/settingsDecryptService');
  return {
    ...actual,
    decryptSettingsSnapshot: (...args: unknown[]) => mockDecryptSettingsSnapshot(...args),
  };
});

// --- Config push ---
const mockEncryptAndPushConfig = jest.fn();
jest.mock('../../src/services/configPushService', () => ({
  encryptAndPushConfig: (...args: unknown[]) => mockEncryptAndPushConfig(...args),
}));

// --- Other API mocks ---
jest.mock('../../src/api/nodeApi', () => ({
  listNodes: jest.fn(),
}));

jest.mock('../../src/api/packageInstallApi', () => ({
  requestUninstall: jest.fn(),
  pollUninstallStatus: jest.fn(),
}));

// --- Heavy child components ---
jest.mock('../../src/components/K2QRCode', () => ({
  K2BackupCard: () => null,
}));

jest.mock('../../src/components/SecretEditDialog', () => () => null);

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PaperProvider theme={lightTheme}>{children}</PaperProvider>
);

function snapshotWithAgents() {
  return {
    schema_version: 1,
    commands_schema_version: 2,
    commands: [
      {
        command_name: 'control_device',
        description: 'Control HA device',
        secrets: [],
        enabled: true,
        associated_service: 'Home Assistant',
      },
      {
        command_name: 'jokes',
        description: 'Tell a joke',
        secrets: [],
        enabled: true,
      },
    ],
    agents: [
      {
        agent_name: 'ha_snapshot',
        description: 'HA state',
        enabled: true,
        schedule: { interval_seconds: 60, run_on_startup: true },
        associated_service: 'Home Assistant',
      },
      {
        agent_name: 'calendar_alerts',
        description: 'Calendar reminders',
        enabled: false,
        schedule: { interval_seconds: 300, run_on_startup: true },
      },
    ],
    device_families: [],
    device_managers: [],
  };
}

async function renderLoaded(snapshot: ReturnType<typeof snapshotWithAgents>) {
  mockHasK2.mockResolvedValue(true);
  mockRequestSettingsSnapshot.mockResolvedValue({ request_id: 'req-1' });
  mockPollSettingsResult.mockResolvedValue({
    status: 'fulfilled',
    snapshot: { ciphertext: 'ct', nonce: 'n', tag: 't' },
  });
  mockDecryptSettingsSnapshot.mockResolvedValue(snapshot);

  const view = render(<NodeSettingsScreen />, { wrapper });
  await waitFor(() => {
    expect(mockDecryptSettingsSnapshot).toHaveBeenCalled();
  });
  return view;
}

describe('NodeSettingsScreen — three-tab layout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders three tabs once the snapshot is loaded', async () => {
    const view = await renderLoaded(snapshotWithAgents());

    await waitFor(() => {
      expect(view.getByText('Commands')).toBeTruthy();
      expect(view.getByText('Agents')).toBeTruthy();
      expect(view.getByText('Integrations')).toBeTruthy();
    });
  });

  it('shows commands flat with their parent integration label', async () => {
    const view = await renderLoaded(snapshotWithAgents());

    await waitFor(() => {
      // Commands tab is default — both commands visible, HA command shows parent label.
      expect(view.getByText('control device')).toBeTruthy();
      expect(view.getByText('jokes')).toBeTruthy();
      expect(view.getByText('from Home Assistant')).toBeTruthy();
    });
  });

  it('switching to Agents tab renders agent rows with associated_service', async () => {
    const view = await renderLoaded(snapshotWithAgents());

    await waitFor(() => expect(view.getByText('control device')).toBeTruthy());

    await act(async () => {
      fireEvent.press(view.getByText('Agents'));
    });

    await waitFor(() => {
      expect(view.getByText('ha snapshot')).toBeTruthy();
      expect(view.getByText('calendar alerts')).toBeTruthy();
      // associated_service for ha_snapshot
      expect(view.getByText('from Home Assistant')).toBeTruthy();
      // formatInterval output
      expect(view.getByText('Runs every 1 minute')).toBeTruthy();
      expect(view.getByText('Runs every 5 minutes')).toBeTruthy();
    });
  });

  it('toggling an agent pushes config_type "agent_registry" with the agent name', async () => {
    const view = await renderLoaded(snapshotWithAgents());
    await waitFor(() => expect(view.getByText('control device')).toBeTruthy());

    await act(async () => {
      fireEvent.press(view.getByText('Agents'));
    });
    await waitFor(() => expect(view.getByText('ha snapshot')).toBeTruthy());

    mockEncryptAndPushConfig.mockResolvedValue(undefined);

    // Two enabled agents render with Switch components. Calendar_alerts is disabled
    // (enabled:false), ha_snapshot is enabled. Find by accessibility role.
    const switches = view.UNSAFE_queryAllByType(
      require('react-native-paper').Switch,
    );
    // Two agents → two switches in the Agents tab.
    expect(switches.length).toBeGreaterThanOrEqual(2);

    // Toggle the first switch (alphabetical sort: calendar_alerts is first).
    await act(async () => {
      switches[0].props.onValueChange(true);
    });

    expect(mockEncryptAndPushConfig).toHaveBeenCalledWith(
      'node-abc',
      'agent_registry',
      { agent_name: 'calendar_alerts', enabled: 'true' },
    );
  });

  it('handles snapshots from older nodes that lack the agents field', async () => {
    const legacy = {
      schema_version: 1,
      commands_schema_version: 2,
      commands: [
        { command_name: 'jokes', description: 'Tell a joke', secrets: [], enabled: true },
      ],
      device_families: [],
      device_managers: [],
      // no `agents` key
    };

    const view = await renderLoaded(legacy as any);

    await act(async () => {
      fireEvent.press(view.getByText('Agents'));
    });

    await waitFor(() => {
      expect(view.getByText('No background agents on this node.')).toBeTruthy();
    });
  });

  it('Integrations tab restores per-component toggles for commands AND agents', async () => {
    // HA has 2 commands + 1 agent (matched via associated_service). The
    // integration card needs a toggle for each so users can disable a single
    // component without leaving the tab.
    const snapshot = {
      schema_version: 1,
      commands_schema_version: 2,
      commands: [
        {
          command_name: 'control_device',
          description: 'Control HA device',
          secrets: [],
          enabled: true,
          associated_service: 'Home Assistant',
        },
        {
          command_name: 'get_state',
          description: 'Get HA state',
          secrets: [],
          enabled: true,
          associated_service: 'Home Assistant',
        },
      ],
      agents: [
        {
          agent_name: 'ha_snapshot',
          description: 'HA state',
          enabled: true,
          schedule: { interval_seconds: 60, run_on_startup: true },
          associated_service: 'Home Assistant',
        },
      ],
      device_families: [],
      device_managers: [],
    };

    const view = await renderLoaded(snapshot as any);
    await waitFor(() => expect(view.getByText('control device')).toBeTruthy());

    await act(async () => {
      fireEvent.press(view.getByText('Integrations'));
    });

    await waitFor(() => {
      // All three components should be listed inside the HA card with toggles.
      expect(view.getByText('Home Assistant')).toBeTruthy();
      expect(view.getByText('control device')).toBeTruthy();
      expect(view.getByText('get state')).toBeTruthy();
      expect(view.getByText('ha snapshot')).toBeTruthy();
      // Type labels disambiguate command vs agent.
      expect(view.getAllByText('Command').length).toBe(2);
      expect(view.getByText('Agent · runs every 1 minute')).toBeTruthy();
    });

    mockEncryptAndPushConfig.mockResolvedValue(undefined);
    const switches = view.UNSAFE_queryAllByType(
      require('react-native-paper').Switch,
    );
    // Disable the agent (last toggle in the integration card) from the
    // Integrations tab — should hit agent_registry, not command_registry.
    const agentSwitch = switches[switches.length - 1];
    await act(async () => {
      agentSwitch.props.onValueChange(false);
    });

    expect(mockEncryptAndPushConfig).toHaveBeenCalledWith(
      'node-abc',
      'agent_registry',
      { agent_name: 'ha_snapshot', enabled: 'false' },
    );
  });

  it('Integrations tab shows empty state when no service groups or families', async () => {
    const noIntegrations = {
      schema_version: 1,
      commands_schema_version: 2,
      // jokes is a standalone command (no associated_service, no secrets) → tier 2,
      // excluded from Integrations tab.
      commands: [
        { command_name: 'jokes', description: 'Tell a joke', secrets: [], enabled: true },
      ],
      agents: [],
      device_families: [],
      device_managers: [],
    };

    const view = await renderLoaded(noIntegrations as any);

    await act(async () => {
      fireEvent.press(view.getByText('Integrations'));
    });

    await waitFor(() => {
      expect(view.getByText('No integrations installed.')).toBeTruthy();
    });
  });
});
