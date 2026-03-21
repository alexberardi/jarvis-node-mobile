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
  loadManualConfigUrl,
} from '../config/serviceConfig';
import {
  DiscoveryResult,
  discoverConfigService,
} from '../services/configDiscoveryService';

interface ConfigContextValue {
  config: ServiceConfig;
  isUsingCloud: boolean;
  fallbackMessage: string | null;
  manualUrl: string | null;
  rediscover: () => Promise<void>;
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

  const runDiscovery = useCallback(async (skipNetworkScan = false) => {
    const discovered = await discoverConfigService(skipNetworkScan);
    applyResult(discovered);
  }, [applyResult]);

  const rediscover = useCallback(async () => {
    setResult(null);
    await clearCachedConfig();
    // User-initiated rediscovery always scans the network
    await runDiscovery(false);
  }, [runDiscovery]);

  const setManualUrl = useCallback(async (url: string | null) => {
    await saveManualConfigUrl(url);
    setManualUrlState(url);
    setResult(null);
    await clearCachedConfig();
    await runDiscovery(false);
  }, [runDiscovery]);

  useEffect(() => {
    const init = async () => {
      const manual = await loadManualConfigUrl();
      setManualUrlState(manual);
      // On first launch (no manual URL, no cache), skip the network scan
      // to avoid racing the iOS local network permission dialog.
      // The user can trigger discovery from the landing screen.
      // On subsequent launches, cached config or manual URL handles it.
      await runDiscovery(!manual);
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
      setManualUrl,
    };
  }, [result, manualUrl, rediscover, setManualUrl]);

  if (!value) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
        <Text variant="bodyLarge" style={styles.loadingText}>
          Discovering Jarvis services...
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
