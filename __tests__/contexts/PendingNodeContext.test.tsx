import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  PendingNodeProvider,
  usePendingNode,
} from '../../src/contexts/PendingNodeContext';
import { PENDING_NODE_KEY } from '../../src/config/storageKeys';

const Consumer = () => {
  const { pendingNodeId, markPending, clearPending } = usePendingNode();
  return (
    <>
      <Text testID="pending">{pendingNodeId ?? 'none'}</Text>
      <TouchableOpacity testID="mark" onPress={() => markPending('node-xyz')}>
        <Text>mark</Text>
      </TouchableOpacity>
      <TouchableOpacity testID="clear" onPress={() => clearPending()}>
        <Text>clear</Text>
      </TouchableOpacity>
    </>
  );
};

const renderProvider = () =>
  render(
    <PendingNodeProvider>
      <Consumer />
    </PendingNodeProvider>,
  );

describe('PendingNodeContext', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it('defaults to no pending node', async () => {
    const { getByTestId } = renderProvider();
    await act(async () => {});
    expect(getByTestId('pending').props.children).toBe('none');
  });

  it('markPending sets the id and persists it', async () => {
    const { getByTestId } = renderProvider();
    await act(async () => {});

    await act(async () => {
      fireEvent.press(getByTestId('mark'));
    });

    expect(getByTestId('pending').props.children).toBe('node-xyz');
    const raw = await AsyncStorage.getItem(PENDING_NODE_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw as string).nodeId).toBe('node-xyz');
  });

  it('clearPending resets the id and removes persistence', async () => {
    const { getByTestId } = renderProvider();
    await act(async () => {});

    await act(async () => {
      fireEvent.press(getByTestId('mark'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('clear'));
    });

    expect(getByTestId('pending').props.children).toBe('none');
    expect(await AsyncStorage.getItem(PENDING_NODE_KEY)).toBeNull();
  });

  it('auto-expires the pending marker after the TTL (self-heal)', async () => {
    jest.useFakeTimers();
    try {
      const { getByTestId } = renderProvider();
      await act(async () => {});

      await act(async () => {
        fireEvent.press(getByTestId('mark'));
      });
      expect(getByTestId('pending').props.children).toBe('node-xyz');

      // 10-minute TTL elapses while still waiting → marker self-clears.
      await act(async () => {
        jest.advanceTimersByTime(10 * 60 * 1000);
      });

      expect(getByTestId('pending').props.children).toBe('none');
      expect(await AsyncStorage.getItem(PENDING_NODE_KEY)).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('rehydrates a recent pending marker on mount', async () => {
    await AsyncStorage.setItem(
      PENDING_NODE_KEY,
      JSON.stringify({ nodeId: 'node-rehydrated', ts: Date.now() }),
    );

    const { getByTestId } = renderProvider();

    await waitFor(() => {
      expect(getByTestId('pending').props.children).toBe('node-rehydrated');
    });
  });

  it('ignores and clears an expired pending marker', async () => {
    await AsyncStorage.setItem(
      PENDING_NODE_KEY,
      JSON.stringify({ nodeId: 'node-stale', ts: Date.now() - 60 * 60 * 1000 }),
    );

    const { getByTestId } = renderProvider();
    await act(async () => {});

    expect(getByTestId('pending').props.children).toBe('none');
    await waitFor(async () => {
      expect(await AsyncStorage.getItem(PENDING_NODE_KEY)).toBeNull();
    });
  });
});
