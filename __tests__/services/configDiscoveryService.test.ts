import { discoverConfigService } from '../../src/services/configDiscoveryService';
import * as serviceConfig from '../../src/config/serviceConfig';

jest.mock('../../src/config/serviceConfig', () => ({
  loadManualConfigUrl: jest.fn(),
  saveManualConfigUrl: jest.fn().mockResolvedValue(undefined),
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

    const result = await discoverConfigService();

    // Regression: older code fell through to mDNS/LAN scan and could land on a
    // different server while still labeling it as the pinned URL. It must
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

    const result = await discoverConfigService();

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

    const result = await discoverConfigService();

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

const reachable = {
  ok: true,
  json: async () => ({
    services: [
      { name: 'jarvis-auth', url: 'http://localhost:7701', host: 'localhost', port: 7701 },
      { name: 'jarvis-command-center', url: 'http://localhost:7703', host: 'localhost', port: 7703 },
    ],
  }),
};

const cachedFor = (configServiceUrl: string) => ({
  authBaseUrl: 'http://10.0.0.5:7701',
  commandCenterUrl: 'http://10.0.0.5:7703',
  configServiceUrl,
  notificationsUrl: '',
  pantryUrl: '',
});

describe('discoverConfigService — no network discovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch as unknown as typeof global.fetch;
    mockedSC.loadCachedConfig.mockResolvedValue(null);
  });

  it('returns an empty config without probing anything when no URL is set', async () => {
    mockedSC.loadManualConfigUrl.mockResolvedValue(null);

    const result = await discoverConfigService();

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.config.configServiceUrl).toBeNull();
    expect(result.config.authBaseUrl).toBe('');
    // The landing screen asks for the URL itself; no banner for a blank URL.
    expect(result.fallbackMessage).toBeNull();
    expect(mockedSC.saveManualConfigUrl).not.toHaveBeenCalled();
  });

  it('caches the config of a reachable pinned URL', async () => {
    mockedSC.loadManualConfigUrl.mockResolvedValue('http://10.0.0.5:7700');
    mockFetch.mockResolvedValue(reachable);

    const result = await discoverConfigService();

    expect(mockedSC.cacheConfig).toHaveBeenCalledWith(result.config);
  });

  it('the unreachable warning no longer offers a network search', async () => {
    mockedSC.loadManualConfigUrl.mockResolvedValue(MANUAL);
    mockFetch.mockRejectedValue(new Error('network down'));

    const result = await discoverConfigService();

    expect(result.fallbackMessage).toBe(
      `Can't reach the server at ${MANUAL}. Check the URL or your connection.`,
    );
  });

  it('falls back to the cached URLs of the same pinned server when it is unreachable', async () => {
    const pinned = 'http://10.0.0.5:7700';
    mockedSC.loadManualConfigUrl.mockResolvedValue(pinned);
    mockedSC.loadCachedConfig.mockResolvedValue(cachedFor(pinned));
    mockFetch.mockRejectedValue(new Error('on the node hotspot'));

    const result = await discoverConfigService();

    expect(result.config).toEqual(cachedFor(pinned));
    expect(result.fallbackMessage).toMatch(/can't reach/i);
    expect(mockedSC.setServiceConfig).toHaveBeenCalledWith(cachedFor(pinned));
  });

  it('ignores a cache from a different server', async () => {
    mockedSC.loadManualConfigUrl.mockResolvedValue(MANUAL);
    mockedSC.loadCachedConfig.mockResolvedValue(cachedFor('http://10.0.0.5:7700'));
    mockFetch.mockRejectedValue(new Error('network down'));

    const result = await discoverConfigService();

    expect(result.config.configServiceUrl).toBe(MANUAL);
    expect(result.config.authBaseUrl).toBe('');
  });

  it('pins the URL an older version discovered, so existing installs keep their server', async () => {
    const discovered = 'http://10.0.0.5:7700';
    mockedSC.loadManualConfigUrl.mockResolvedValue(null);
    mockedSC.loadCachedConfig.mockResolvedValue(cachedFor(discovered));
    mockFetch.mockResolvedValue(reachable);

    const result = await discoverConfigService();

    expect(mockedSC.saveManualConfigUrl).toHaveBeenCalledWith(discovered);
    expect(mockFetch).toHaveBeenCalledWith(
      `${discovered}/services?style=external`,
      expect.anything(),
    );
    expect(result.config.configServiceUrl).toBe(discovered);
  });
});

describe('discoverConfigService — path-prefixed service URLs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch as unknown as typeof global.fetch;
  });

  it('keeps a path-prefixed service URL', async () => {
    mockedSC.loadManualConfigUrl.mockResolvedValue('http://10.0.0.5:7700');
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        services: [
          { name: 'jarvis-command-center', url: 'http://localhost:7700/cc', path: '/cc', host: 'localhost', port: 7700 },
          { name: 'jarvis-auth', url: 'http://localhost:7700/auth/', host: 'localhost', port: 7700 },
        ],
      }),
    });

    const result = await discoverConfigService();

    expect(result.config.commandCenterUrl).toBe('http://10.0.0.5:7700/cc');
    expect(result.config.authBaseUrl).toBe('http://10.0.0.5:7700/auth');
  });
});
