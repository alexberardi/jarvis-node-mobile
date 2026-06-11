import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import NodeSettingsScreen from '../../src/screens/Nodes/NodeSettingsScreen';
import { HelpProvider } from '../../src/components/HelpProvider';
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

// --- Household members (user-type secret picker) ---
const mockListHouseholdMembers = jest.fn();
jest.mock('../../src/api/householdApi', () => ({
  listHouseholdMembers: (...args: unknown[]) => mockListHouseholdMembers(...args),
}));

// --- Heavy child components ---
jest.mock('../../src/components/K2QRCode', () => ({
  K2BackupCard: () => null,
}));

// SecretEditDialog is NOT mocked — the user-type secret tests drive the real
// picker through the dialog's save path. It stays unmounted until a secret
// row is pressed, so the other suites are unaffected.

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PaperProvider theme={lightTheme}>
    <HelpProvider>{children}</HelpProvider>
  </PaperProvider>
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
      expect(view.getByText('Tasks')).toBeTruthy();
      expect(view.getByText('Services')).toBeTruthy();
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
      fireEvent.press(view.getByText('Tasks'));
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
      fireEvent.press(view.getByText('Tasks'));
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
      fireEvent.press(view.getByText('Tasks'));
    });

    await waitFor(() => {
      expect(view.getByText('No background tasks on this node.')).toBeTruthy();
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
      fireEvent.press(view.getByText('Services'));
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
      fireEvent.press(view.getByText('Services'));
    });

    await waitFor(() => {
      expect(view.getByText('No services installed.')).toBeTruthy();
    });
  });
});

describe('NodeSettingsScreen — agent secret values', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the plain value for a non-sensitive agent secret on the Tasks tab', async () => {
    const snapshot = snapshotWithAgents();
    (snapshot.agents[1] as any).secrets = [
      {
        key: 'EMAIL_ALERT_URGENT_KEYWORDS',
        scope: 'user',
        description: 'Comma-separated urgent keywords',
        value_type: 'string',
        required: false,
        is_sensitive: false,
        is_set: true,
        value: 'urgent,asap',
        friendly_name: 'Urgent Keywords',
      },
      {
        key: 'ICLOUD_PASSWORD',
        scope: 'user',
        description: 'iCloud app password',
        value_type: 'string',
        required: true,
        is_sensitive: true,
        is_set: true,
        friendly_name: 'iCloud Password',
      },
    ];

    const view = await renderLoaded(snapshot);
    await waitFor(() => expect(view.getByText('control device')).toBeTruthy());

    await act(async () => {
      fireEvent.press(view.getByText('Tasks'));
    });

    await waitFor(() => {
      // Non-sensitive secret with a value → the value itself is shown,
      // exactly like the Services-tab command cards.
      expect(view.getByText('Urgent Keywords')).toBeTruthy();
      expect(view.getByText('urgent,asap')).toBeTruthy();
      // Sensitive-but-set secret stays masked as "Configured".
      expect(view.getByText('iCloud Password')).toBeTruthy();
      expect(view.getByText('Configured')).toBeTruthy();
    });
  });
});

describe('NodeSettingsScreen — "user" value_type secrets', () => {
  const members = [
    { user_id: 7, username: 'alex', email: 'alex@example.com', role: 'admin' },
    { user_id: 8, username: 'sam', email: 'sam@example.com', role: 'member' },
  ];

  const userSecret = {
    key: 'EMAIL_AGENT_USER',
    scope: 'integration',
    description: 'Who the email agents run as and notify',
    value_type: 'user',
    required: false,
    is_sensitive: false,
    is_set: false,
    friendly_name: 'Runs As',
  };

  function emailSnapshot(secret: Record<string, unknown>) {
    return {
      schema_version: 1,
      commands_schema_version: 2,
      commands: [
        {
          command_name: 'check_email',
          description: 'Check email',
          secrets: [secret],
          enabled: true,
          associated_service: 'Email',
        },
      ],
      agents: [],
      device_families: [],
      device_managers: [],
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('previews the member name instead of the raw stored id', async () => {
    mockListHouseholdMembers.mockResolvedValue(members);

    const view = await renderLoaded(
      emailSnapshot({ ...userSecret, is_set: true, value: '7' }) as any,
    );

    await act(async () => {
      fireEvent.press(view.getByText('Services'));
    });

    await waitFor(() => {
      expect(mockListHouseholdMembers).toHaveBeenCalledWith('hh-1', 'mock-token');
      expect(view.getByText('alex')).toBeTruthy();
      // The raw id must not leak into the row preview.
      expect(view.queryByText('7')).toBeNull();
    });
  });

  it('falls back to "User {id}" when the members fetch fails', async () => {
    mockListHouseholdMembers.mockRejectedValue(new Error('auth down'));

    const view = await renderLoaded(
      emailSnapshot({ ...userSecret, is_set: true, value: '7' }) as any,
    );

    await act(async () => {
      fireEvent.press(view.getByText('Services'));
    });

    await waitFor(() => {
      expect(view.getByText('User 7')).toBeTruthy();
    });
  });

  it('renders the member picker and saving sends the selected id', async () => {
    mockListHouseholdMembers.mockResolvedValue(members);
    mockEncryptAndPushConfig.mockResolvedValue(undefined);

    const view = await renderLoaded(emailSnapshot(userSecret) as any);

    await act(async () => {
      fireEvent.press(view.getByText('Services'));
    });
    await waitFor(() => expect(view.getByText('Runs As')).toBeTruthy());
    // Members must be loaded before opening the editor so the picker has options.
    await waitFor(() => expect(mockListHouseholdMembers).toHaveBeenCalled());

    // Open the editor for the user-type secret.
    await act(async () => {
      fireEvent.press(view.getByText('Runs As'));
    });
    await waitFor(() => expect(view.getByText('Select a person')).toBeTruthy());

    // Pick a member by display name.
    await act(async () => {
      fireEvent.press(view.getByText('Select a person'));
    });
    await waitFor(() => expect(view.getByText('sam')).toBeTruthy());
    await act(async () => {
      fireEvent.press(view.getByText('sam'));
    });

    await act(async () => {
      fireEvent.press(view.getByText('Save'));
    });

    await waitFor(() => {
      expect(mockEncryptAndPushConfig).toHaveBeenCalledWith(
        'node-abc',
        'settings:secrets',
        { EMAIL_AGENT_USER: '8' },
      );
    });
  });
});

describe('NodeSettingsScreen — package health badges', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows an amber Needs setup badge for unconfigured agents on the Tasks tab', async () => {
    const snapshot = snapshotWithAgents();
    (snapshot.agents[1] as any).unconfigured = true;
    (snapshot.agents[1] as any).missing_secrets = ['ICLOUD_PASSWORD'];

    const view = await renderLoaded(snapshot);
    await waitFor(() => expect(view.getByText('control device')).toBeTruthy());

    await act(async () => {
      fireEvent.press(view.getByText('Tasks'));
    });

    await waitFor(() => {
      expect(view.getByText('Needs setup — missing ICLOUD_PASSWORD')).toBeTruthy();
      // The unconfigured agent stays listed alongside the healthy one.
      expect(view.getByText('calendar alerts')).toBeTruthy();
      expect(view.getByText('ha snapshot')).toBeTruthy();
    });
  });

  it('labels entries with an import_failed tag as Failed to load', async () => {
    const snapshot = snapshotWithAgents();
    (snapshot.commands[1] as any)._errors = ['import_failed: cannot import name JarvisInbox'];

    const view = await renderLoaded(snapshot);

    await waitFor(() => {
      expect(view.getByText('Failed to load')).toBeTruthy();
    });
  });

  it('keeps the configuration-error label for field-level _errors tags', async () => {
    const snapshot = snapshotWithAgents();
    (snapshot.commands[1] as any)._errors = ['required_secrets'];

    const view = await renderLoaded(snapshot);

    await waitFor(() => {
      expect(view.getByText('Configuration error: required_secrets')).toBeTruthy();
    });
  });
});
