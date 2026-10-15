import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import NodeListScreen from '../../src/screens/Nodes/NodeListScreen';
import { lightTheme } from '../../src/theme';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
  }),
  useFocusEffect: (cb: () => void) => {
    const { useEffect } = require('react');
    useEffect(() => {
      cb();
    }, []);
  },
}));

jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({
    state: {
      isAuthenticated: true,
      accessToken: 'mock-token',
      activeHouseholdId: 'household-1',
      households: [{ id: 'household-1', name: 'Home', role: 'admin' }],
      user: { id: 1, email: 'test@test.com' },
    },
    logout: jest.fn(),
  }),
}));

const mockListNodes = jest.fn();

jest.mock('../../src/api/nodeApi', () => ({
  listNodes: (...args: any[]) => mockListNodes(...args),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PaperProvider theme={lightTheme}>{children}</PaperProvider>
);

const sampleNodes = [
  {
    node_id: 'node-1',
    room: 'Kitchen',
    user: null,
    voice_mode: 'push-to-talk',
    adapter_hash: null,
    household_id: 'household-1',
    online: true,
    last_seen: new Date().toISOString(),
  },
  {
    node_id: 'node-2',
    room: 'Bedroom',
    user: null,
    voice_mode: 'wake-word',
    adapter_hash: null,
    household_id: 'household-1',
    online: false,
    last_seen: '2025-01-01T00:00:00Z',
  },
];

describe('NodeListScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListNodes.mockResolvedValue([]);
  });

  it('should render the "Nodes" title', async () => {
    const { getByText } = render(<NodeListScreen />, { wrapper });

    await waitFor(() => {
      expect(getByText('Nodes')).toBeTruthy();
    });
  });

  it('should show the "Import Key" button', async () => {
    const { getByText } = render(<NodeListScreen />, { wrapper });

    await waitFor(() => {
      expect(getByText('Import Key')).toBeTruthy();
    });
  });

  it('should show "No nodes yet" when node list is empty', async () => {
    mockListNodes.mockResolvedValue([]);

    const { getByText } = render(<NodeListScreen />, { wrapper });

    await waitFor(() => {
      expect(getByText('No nodes yet. Add your first node.')).toBeTruthy();
    });
  });

  it('should show node cards with room name', async () => {
    mockListNodes.mockResolvedValue(sampleNodes);

    const { getByText } = render(<NodeListScreen />, { wrapper });

    await waitFor(() => {
      expect(getByText('Kitchen')).toBeTruthy();
      expect(getByText('Bedroom')).toBeTruthy();
    });
  });

  it('names a computer by its registered name and a Pi by its room', async () => {
    mockListNodes.mockResolvedValue([
      { ...sampleNodes[0], name: 'pi-zero' },
      { ...sampleNodes[0], node_id: 'agent-1', room: 'desktop', node_kind: 'desktop', name: 'omarchy' },
    ]);

    const { getByText, queryByText } = render(<NodeListScreen />, { wrapper });

    await waitFor(() => {
      expect(getByText('Kitchen')).toBeTruthy();
      expect(getByText('omarchy')).toBeTruthy();
    });
    expect(queryByText('pi-zero')).toBeNull();
  });

  it('should show online status for online nodes', async () => {
    mockListNodes.mockResolvedValue(sampleNodes);

    const { getByText } = render(<NodeListScreen />, { wrapper });

    await waitFor(() => {
      expect(getByText('Online')).toBeTruthy();
    });
  });

  it('should show offline status for offline nodes', async () => {
    mockListNodes.mockResolvedValue(sampleNodes);

    const { getByText } = render(<NodeListScreen />, { wrapper });

    await waitFor(() => {
      expect(getByText(/Offline/)).toBeTruthy();
    });
  });

  it('reads a naive UTC last_seen as UTC and never says "Just now" when offline', async () => {
    // Fake only Date: the clock is pinned, real timers keep waitFor working.
    jest.useFakeTimers({
      now: new Date('2026-10-12T18:00:00Z'),
      doNotFake: [
        'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
        'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask',
        'requestAnimationFrame', 'cancelAnimationFrame', 'hrtime', 'performance',
      ],
    });
    try {
      mockListNodes.mockResolvedValue([
        { ...sampleNodes[1], last_seen: '2026-10-12T14:59:00.123456' },
      ]);

      const { getByText, queryByText } = render(<NodeListScreen />, { wrapper });

      await waitFor(() => {
        expect(getByText('Offline \u00B7 Last seen 3h ago')).toBeTruthy();
      });
      expect(queryByText(/Just now/)).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('should show the FAB with "Add Node" label', async () => {
    const { getByText } = render(<NodeListScreen />, { wrapper });

    await waitFor(() => {
      expect(getByText('Add Node')).toBeTruthy();
    });
  });

  it('should show error message on load failure', async () => {
    mockListNodes.mockRejectedValue(new Error('Network error'));

    const { getByText } = render(<NodeListScreen />, { wrapper });

    await waitFor(() => {
      expect(getByText('Could not load nodes')).toBeTruthy();
    });
  });

  it('should show Retry button when there is an error', async () => {
    mockListNodes.mockRejectedValue(new Error('Network error'));

    const { getByText } = render(<NodeListScreen />, { wrapper });

    await waitFor(() => {
      expect(getByText('Retry')).toBeTruthy();
    });
  });

  it('should show voice mode for each node', async () => {
    mockListNodes.mockResolvedValue(sampleNodes);

    const { getByText } = render(<NodeListScreen />, { wrapper });

    await waitFor(() => {
      expect(getByText('Mode: push-to-talk')).toBeTruthy();
      expect(getByText('Mode: wake-word')).toBeTruthy();
    });
  });

  it('should call listNodes with household ID on mount', async () => {
    mockListNodes.mockResolvedValue([]);

    render(<NodeListScreen />, { wrapper });

    await waitFor(() => {
      expect(mockListNodes).toHaveBeenCalledWith('household-1');
    });
  });
});

describe('NodeListScreen — node kind icons', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows the Raspberry Pi icon for a Pi and the robot for a desktop agent', async () => {
    mockListNodes.mockResolvedValue([
      { ...sampleNodes[0], install_mode: 'tarball', node_kind: null },
      {
        ...sampleNodes[1],
        node_id: 'agent-1',
        room: 'Office PC',
        install_mode: 'desktop-agent',
        node_kind: 'desktop',
      },
    ]);
    const { findByTestId, getByTestId, getByText, queryByText } = render(<NodeListScreen />, { wrapper });

    const pi = await findByTestId('node-kind-icon-node-1');
    expect(pi.props.accessibilityLabel).toBe('Raspberry Pi');
    const agent = getByTestId('node-kind-icon-agent-1');
    expect(agent.props.accessibilityLabel).toBe('Computer');
    // A computer has no Pi voice mode; it says what it is instead.
    expect(getByText('Mode: push-to-talk')).toBeTruthy();
    expect(queryByText('Mode: wake-word')).toBeNull();
    expect(getByText('Jarvis Automation agent')).toBeTruthy();
  });

  it('offers "Add a computer" next to "Add Node", opening the pairing screen', async () => {
    mockListNodes.mockResolvedValue([]);
    const { findByTestId, getByText } = render(<NodeListScreen />, { wrapper });
    const btn = await findByTestId('node-add-computer-fab');
    expect(btn).toHaveTextContent(/Add a computer/);
    expect(getByText('Add Node')).toBeTruthy();
    fireEvent.press(btn);
    expect(mockNavigate).toHaveBeenCalledWith('AddComputer');
  });
});
