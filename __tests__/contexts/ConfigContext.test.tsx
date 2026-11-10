import React, { useEffect } from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ConfigProvider, useConfig } from '../../src/contexts/ConfigContext';
import { discoverConfigService } from '../../src/services/configDiscoveryService';

jest.mock('../../src/services/configDiscoveryService', () => ({
  discoverConfigService: jest.fn(),
  loadPinnedUrl: jest.fn().mockResolvedValue(null),
}));

const mockDiscover = discoverConfigService as jest.Mock;

const discovered = (configServiceUrl: string) => ({
  config: { configServiceUrl, authBaseUrl: '', commandCenterUrl: '' },
  isCloud: false,
  fallbackMessage: null,
});

let mounts = 0;
const Consumer = () => {
  const { config, rediscover, recheck } = useConfig();
  useEffect(() => {
    mounts += 1;
  }, []);
  return (
    <>
      <Text testID="url">{config.configServiceUrl}</Text>
      <TouchableOpacity testID="recheck" onPress={() => recheck()}>
        <Text>recheck</Text>
      </TouchableOpacity>
      <TouchableOpacity testID="rediscover" onPress={() => rediscover()}>
        <Text>rediscover</Text>
      </TouchableOpacity>
    </>
  );
};

describe('ConfigContext', () => {
  beforeEach(() => {
    mounts = 0;
    mockDiscover.mockReset();
  });

  // Settings' Re-check Connection must not unmount the app (which drops navigation back to Home).
  it('recheck keeps the children mounted and swaps the config in place', async () => {
    mockDiscover.mockResolvedValueOnce(discovered('http://first'));
    render(
      <ConfigProvider>
        <Consumer />
      </ConfigProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('url')).toHaveTextContent('http://first'));

    let finish!: (v: ReturnType<typeof discovered>) => void;
    mockDiscover.mockReturnValueOnce(new Promise((r) => { finish = r; }));
    fireEvent.press(screen.getByTestId('recheck'));
    await waitFor(() => expect(mockDiscover).toHaveBeenCalledTimes(2));

    expect(screen.queryByText('Connecting...')).toBeNull();
    expect(screen.getByTestId('url')).toHaveTextContent('http://first');

    await act(async () => finish(discovered('http://second')));
    expect(screen.getByTestId('url')).toHaveTextContent('http://second');
    expect(mounts).toBe(1);
  });

  // Logout and delete-account call rediscover and rely on the full remount to reset state.
  it('rediscover shows Connecting... and remounts the children', async () => {
    mockDiscover.mockResolvedValueOnce(discovered('http://first'));
    render(
      <ConfigProvider>
        <Consumer />
      </ConfigProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('url')).toHaveTextContent('http://first'));

    let finish!: (v: ReturnType<typeof discovered>) => void;
    mockDiscover.mockReturnValueOnce(new Promise((r) => { finish = r; }));
    fireEvent.press(screen.getByTestId('rediscover'));
    await waitFor(() => expect(mockDiscover).toHaveBeenCalledTimes(2));

    expect(screen.getByText('Connecting...')).toBeTruthy();
    expect(screen.queryByTestId('url')).toBeNull();

    await act(async () => finish(discovered('http://second')));
    expect(screen.getByTestId('url')).toHaveTextContent('http://second');
    expect(mounts).toBe(2);
  });
});
