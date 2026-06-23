import { discoverConfigService } from '../../src/services/configDiscoveryService';
import * as serviceConfig from '../../src/config/serviceConfig';

// DEV_MODE on + a baked config URL — the development-e2e profile's behavior.
// Isolated to this file so the existing discovery tests keep real env values.
jest.mock('../../src/config/env', () => ({
  DEV_MODE: true,
  MANUAL_CONFIG_URL: 'http://localhost:7700',
}));

// Native module stubs (same as configDiscoveryService.test.ts).
jest.mock('react-native-zeroconf', () =>
  jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    scan: jest.fn(),
    stop: jest.fn(),
    removeAllListeners: jest.fn(),
  })),
);
jest.mock('expo-network', () => ({
  getIpAddressAsync: jest.fn().mockResolvedValue('192.168.1.50'),
}));
jest.mock('../../src/config/serviceConfig', () => ({
  loadManualConfigUrl: jest.fn(),
  loadCachedConfig: jest.fn().mockResolvedValue(null),
  cacheConfig: jest.fn().mockResolvedValue(undefined),
  setServiceConfig: jest.fn(),
}));

const mockedSC = serviceConfig as jest.Mocked<typeof serviceConfig>;
const BAKED = 'http://localhost:7700';
const PINNED = 'http://192.168.1.99:7700';
const mockFetch = jest.fn();

const servicesPayload = (configHost: string) => ({
  ok: true,
  json: async () => ({
    services: [
      { name: 'jarvis-auth', url: `http://${configHost}:7701`, host: configHost, port: 7701 },
      { name: 'jarvis-command-center', url: `http://${configHost}:7703`, host: configHost, port: 7703 },
    ],
  }),
});

describe('discoverConfigService — DEV_MODE baked config URL (EXPO_PUBLIC_MANUAL_CONFIG_URL)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch as unknown as typeof global.fetch;
  });

  it('seeds the baked config URL when AsyncStorage has no pinned URL (fresh clearState e2e build)', async () => {
    mockedSC.loadManualConfigUrl.mockResolvedValue(null);
    mockFetch.mockResolvedValue(servicesPayload('localhost'));

    const result = await discoverConfigService(false);

    // Resolved against the baked URL via Tier 0 — never fell through to mDNS/scan.
    expect(mockFetch).toHaveBeenCalledWith(
      `${BAKED}/services?style=external`,
      expect.anything(),
    );
    expect(result.config.configServiceUrl).toBe(BAKED);
    expect(result.config.commandCenterUrl).toBe('http://localhost:7703');
    expect(result.fallbackMessage).toBeNull();
  });

  it('a UI-pinned URL still wins over the baked env URL', async () => {
    mockedSC.loadManualConfigUrl.mockResolvedValue(PINNED);
    mockFetch.mockResolvedValue(servicesPayload('192.168.1.99'));

    const result = await discoverConfigService(false);

    expect(mockFetch).toHaveBeenCalledWith(
      `${PINNED}/services?style=external`,
      expect.anything(),
    );
    expect(mockFetch).not.toHaveBeenCalledWith(
      `${BAKED}/services?style=external`,
      expect.anything(),
    );
    expect(result.config.configServiceUrl).toBe(PINNED);
  });
});
