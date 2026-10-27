import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import authApi from '../api/authApi';
import {
  ServiceConfig,
  clearCachedConfig,
  saveManualConfigUrl,
} from '../config/serviceConfig';
import {
  DiscoveryResult,
  discoverConfigService,
  loadPinnedUrl,
} from '../services/configDiscoveryService';

interface ConfigContextValue {
  config: ServiceConfig;
  isUsingCloud: boolean;
  fallbackMessage: string | null;
  manualUrl: string | null;
  rediscover: () => Promise<void>;
  recheck: () => Promise<void>;
  setManualUrl: (url: string | null) => Promise<void>;
}

const ConfigContext = createContext<ConfigContextValue | undefined>(undefined);

export const ConfigProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [result, setResult] = useState<DiscoveryResult | null>(null);
  const [manualUrl, setManualUrlState] = useState<string | null>(null);

  const applyResult = useCallback((discovered: DiscoveryResult) => {
    if (discovered.config.authBaseUrl) {
      authApi.defaults.baseURL = discovered.config.authBaseUrl;
    }
    setResult(discovered);
  }, []);

  const runDiscovery = useCallback(async () => {
    const discovered = await discoverConfigService();
    applyResult(discovered);
  }, [applyResult]);

  // Re-check the server URL (no network scan). Clearing the result remounts the whole app,
  // which logout and delete-account rely on to reset in-memory state.
  const rediscover = useCallback(async () => {
    setResult(null);
    await clearCachedConfig();
    await runDiscovery();
  }, [runDiscovery]);

  // Settings' Re-check Connection: same, but keeps the app mounted (and on Settings) until
  // the new result lands.
  const recheck = useCallback(async () => {
    await clearCachedConfig();
    await runDiscovery();
  }, [runDiscovery]);

  const setManualUrl = useCallback(async (url: string | null) => {
    await saveManualConfigUrl(url);
    setManualUrlState(url);
    setResult(null);
    await clearCachedConfig();
    await runDiscovery();
  }, [runDiscovery]);

  useEffect(() => {
    const init = async () => {
      setManualUrlState(await loadPinnedUrl());
      await runDiscovery();
    };
    init();
  }, [runDiscovery]);

  const value = useMemo(() => {
    if (!result) return null;
    return {
      config: result.config,
      isUsingCloud: result.isCloud,
      fallbackMessage: result.fallbackMessage,
      manualUrl,
      rediscover,
      recheck,
      setManualUrl,
    };
  }, [result, manualUrl, rediscover, recheck, setManualUrl]);

  if (!value) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
        <Text variant="bodyLarge" style={styles.loadingText}>
          Connecting...
        </Text>
      </View>
    );
  }

  return (
    <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>
  );
};

export const useConfig = (): ConfigContextValue => {
  const ctx = useContext(ConfigContext);
  if (!ctx) {
    throw new Error('useConfig must be used within ConfigProvider');
  }
  return ctx;
};

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    opacity: 0.7,
  },
});
