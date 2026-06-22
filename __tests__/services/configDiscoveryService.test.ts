import { discoverConfigService } from '../../src/services/configDiscoveryService';
import * as serviceConfig from '../../src/config/serviceConfig';

// react-native-zeroconf is a native module — stub it so the module under test
// can be imported. With the manual-URL-authoritative behavior it should never
// actually be exercised when a manual URL is pinned.
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
const MANUAL = 'https://config.jarvisautomation.io';
const mockFetch = jest.fn();

describe('discoverConfigService — pinned manual URL is authoritative', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch as unknown as typeof global.fetch;
  });

  it('does NOT fall through to auto-discovery when the pinned URL is unreachable', async () => {
    mockedSC.loadManualConfigUrl.mockResolvedValue(MANUAL);
    // The /services fetch fails → manual URL is momentarily unreachable.
    mockFetch.mockRejectedValue(new Error('network down'));

    const result = await discoverConfigService(false);

    // Regression: the OLD code fell through to mDNS/LAN scan and could land on a
    // different server while still labeling it as the pinned URL. Now it must
    // report the pinned URL itself, with empty service URLs and an error.
    expect(result.config.configServiceUrl).toBe(MANUAL);
    expect(result.config.authBaseUrl).toBe('');
    expect(result.config.commandCenterUrl).toBe('');
    expect(result.fallbackMessage).toMatch(/can't reach/i);
    expect(mockedSC.setServiceConfig).toHaveBeenCalledWith(
      expect.objectContaining({ configServiceUrl: MANUAL, authBaseUrl: '' }),
    );
  });

  it('uses the pinned URL when it is reachable', async () => {
    mockedSC.loadManualConfigUrl.mockResolvedValue(MANUAL);
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        services: [
          { name: 'jarvis-auth', url: 'https://auth.jarvisautomation.io', host: 'auth.jarvisautomation.io', port: 443 },
          { name: 'jarvis-command-center', url: 'https://command-center.jarvisautomation.io', host: 'command-center.jarvisautomation.io', port: 443 },
        ],
      }),
    });

    const result = await discoverConfigService(false);

    expect(result.config.configServiceUrl).toBe(MANUAL);
    expect(result.config.authBaseUrl).toBe('https://auth.jarvisautomation.io');
    expect(result.config.commandCenterUrl).toBe('https://command-center.jarvisautomation.io');
    expect(result.fallbackMessage).toBeNull();
  });
});

describe('discoverConfigService — external URL style (mobile reachability)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch as unknown as typeof global.fetch;
  });

  it('requests ?style=external and rewrites the localhost sentinel to the config host', async () => {
    mockedSC.loadManualConfigUrl.mockResolvedValue(MANUAL);
    // config-service (external style) returns published coords with a localhost
    // sentinel — what the proper fix registers.
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        services: [
          { name: 'jarvis-auth', url: 'http://localhost:7701', host: 'localhost', port: 7701 },
          { name: 'jarvis-command-center', url: 'http://localhost:7703', host: 'localhost', port: 7703 },
        ],
      }),
    });

    const result = await discoverConfigService(false);

    // must ask for the external (off-docker) style, or the phone gets container coords
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/services?style=external'),
      expect.anything(),
    );
    // and the localhost sentinel must be rewritten to the reachable config host
    expect(result.config.authBaseUrl).toBe('http://config.jarvisautomation.io:7701');
    expect(result.config.commandCenterUrl).toBe('http://config.jarvisautomation.io:7703');
  });
});
