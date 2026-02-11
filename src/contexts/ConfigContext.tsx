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
import { ServiceConfig } from '../config/serviceConfig';
import { clearCachedConfig } from '../config/serviceConfig';
import {
  DiscoveryResult,
  discoverConfigService,
} from '../services/configDiscoveryService';

interface ConfigContextValue {
  config: ServiceConfig;
  isUsingCloud: boolean;
  fallbackMessage: string | null;
  rediscover: () => Promise<void>;
}

const ConfigContext = createContext<ConfigContextValue | undefined>(undefined);

export const ConfigProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [result, setResult] = useState<DiscoveryResult | null>(null);

  const runDiscovery = useCallback(async () => {
    const discovered = await discoverConfigService();
    // Set authApi baseURL before AuthProvider mounts
    if (discovered.config.authBaseUrl) {
      authApi.defaults.baseURL = discovered.config.authBaseUrl;
    }
    setResult(discovered);
  }, []);

  const rediscover = useCallback(async () => {
    setResult(null);
    await clearCachedConfig();
    await runDiscovery();
  }, [runDiscovery]);

  useEffect(() => {
    runDiscovery();
  }, [runDiscovery]);

  const value = useMemo(() => {
    if (!result) return null;
    return {
      config: result.config,
      isUsingCloud: result.isCloud,
      fallbackMessage: result.fallbackMessage,
      rediscover,
    };
  }, [result, rediscover]);

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
