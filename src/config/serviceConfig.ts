import AsyncStorage from '@react-native-async-storage/async-storage';

export const CLOUD_CONFIG_URL = 'https://config.jarvisautomation.io';

const CACHE_KEY = '@jarvis_node_mobile/service_config';

export interface ServiceConfig {
  authBaseUrl: string;
  commandCenterUrl: string;
  configServiceUrl: string | null;
}

let currentConfig: ServiceConfig = {
  authBaseUrl: '',
  commandCenterUrl: '',
  configServiceUrl: null,
};

export const getServiceConfig = (): ServiceConfig => currentConfig;

export const setServiceConfig = (config: ServiceConfig): void => {
  currentConfig = config;
};

export const getAuthApiBaseUrl = (): string => currentConfig.authBaseUrl;

export const getCommandCenterUrl = (): string => currentConfig.commandCenterUrl;

export const cacheConfig = async (config: ServiceConfig): Promise<void> => {
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(config));
};

export const loadCachedConfig = async (): Promise<ServiceConfig | null> => {
  const raw = await AsyncStorage.getItem(CACHE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ServiceConfig;
  } catch {
    return null;
  }
};

export const clearCachedConfig = async (): Promise<void> => {
  await AsyncStorage.removeItem(CACHE_KEY);
};
