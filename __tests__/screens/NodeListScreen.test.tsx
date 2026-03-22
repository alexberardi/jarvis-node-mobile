import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
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
const mockDeleteNode = jest.fn();

jest.mock('../../src/api/nodeApi', () => ({
  listNodes: (...args: any[]) => mockListNodes(...args),
  deleteNode: (...args: any[]) => mockDeleteNode(...args),
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
