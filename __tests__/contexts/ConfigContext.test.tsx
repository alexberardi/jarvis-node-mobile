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
  const { config, rediscover } = useConfig();
  useEffect(() => {
    mounts += 1;
  }, []);
  return (
    <>
      <Text testID="url">{config.configServiceUrl}</Text>
      <TouchableOpacity testID="recheck" onPress={() => rediscover()}>
        <Text>recheck</Text>
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
  it('rediscover keeps the children mounted and swaps the config in place', async () => {
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
});
