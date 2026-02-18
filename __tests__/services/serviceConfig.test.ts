import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  getServiceConfig,
  setServiceConfig,
  getAuthApiBaseUrl,
  getCommandCenterUrl,
  cacheConfig,
  loadCachedConfig,
  clearCachedConfig,
  ServiceConfig,
  CLOUD_CONFIG_URL,
} from '../../src/config/serviceConfig';

describe('serviceConfig', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset to default config
    setServiceConfig({
      authBaseUrl: '',
      commandCenterUrl: '',
      configServiceUrl: null,
    });
  });

  describe('CLOUD_CONFIG_URL', () => {
    it('should be defined', () => {
      expect(CLOUD_CONFIG_URL).toBe('https://config.jarvisautomation.io');
    });
  });

  describe('getServiceConfig / setServiceConfig', () => {
    it('should return default empty config initially', () => {
      const config = getServiceConfig();

      expect(config.authBaseUrl).toBe('');
      expect(config.commandCenterUrl).toBe('');
      expect(config.configServiceUrl).toBeNull();
    });

    it('should return updated config after set', () => {
      const newConfig: ServiceConfig = {
        authBaseUrl: 'http://192.168.1.10:8001',
        commandCenterUrl: 'http://192.168.1.10:8002',
        configServiceUrl: 'http://192.168.1.10:8013',
      };

      setServiceConfig(newConfig);
      const config = getServiceConfig();

      expect(config).toEqual(newConfig);
    });
  });

  describe('getAuthApiBaseUrl', () => {
    it('should return the auth base URL from current config', () => {
      setServiceConfig({
        authBaseUrl: 'http://localhost:8001',
        commandCenterUrl: '',
        configServiceUrl: null,
      });

      expect(getAuthApiBaseUrl()).toBe('http://localhost:8001');
    });
  });

  describe('getCommandCenterUrl', () => {
    it('should return the command center URL from current config', () => {
      setServiceConfig({
        authBaseUrl: '',
        commandCenterUrl: 'http://localhost:8002',
        configServiceUrl: null,
      });

      expect(getCommandCenterUrl()).toBe('http://localhost:8002');
    });
  });

  describe('cacheConfig', () => {
    it('should save config to AsyncStorage as JSON', async () => {
      const config: ServiceConfig = {
        authBaseUrl: 'http://192.168.1.10:8001',
        commandCenterUrl: 'http://192.168.1.10:8002',
        configServiceUrl: 'http://192.168.1.10:8013',
      };

      await cacheConfig(config);

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@jarvis_node_mobile/service_config',
        JSON.stringify(config)
      );
    });
  });

  describe('loadCachedConfig', () => {
    it('should return null when no config is cached', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      const result = await loadCachedConfig();

      expect(result).toBeNull();
    });

    it('should return parsed config when cached', async () => {
      const config: ServiceConfig = {
        authBaseUrl: 'http://192.168.1.10:8001',
        commandCenterUrl: 'http://192.168.1.10:8002',
        configServiceUrl: 'http://192.168.1.10:8013',
      };

      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(config));

      const result = await loadCachedConfig();

      expect(result).toEqual(config);
    });

    it('should return null for invalid JSON', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('not-valid-json{{{');

      const result = await loadCachedConfig();

      expect(result).toBeNull();
    });
  });

  describe('clearCachedConfig', () => {
    it('should remove cached config from AsyncStorage', async () => {
      await clearCachedConfig();

      expect(AsyncStorage.removeItem).toHaveBeenCalledWith(
        '@jarvis_node_mobile/service_config'
      );
    });
  });
});
