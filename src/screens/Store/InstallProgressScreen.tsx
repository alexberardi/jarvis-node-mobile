import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Card,
  Icon,
  Text,
  useTheme,
} from 'react-native-paper';

import { pollInstallStatus } from '../../api/packageInstallApi';
import { StoreStackParamList } from '../../navigation/types';
import type { InstallStatus, InstallStatusValue } from '../../types/Package';

type Nav = NativeStackNavigationProp<StoreStackParamList>;
type Route = RouteProp<StoreStackParamList, 'InstallProgress'>;

interface InstallEntry {
  requestId: string;
  nodeId: string;
  nodeName: string;
}

const POLL_INTERVAL_MS = 2000;

const TERMINAL_STATES: Set<InstallStatusValue> = new Set(['completed', 'failed', 'expired']);

const InstallProgressScreen = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const theme = useTheme();

  const installs: InstallEntry[] = JSON.parse(route.params.installs);
  const { packageName } = route.params;

  const [statuses, setStatuses] = useState<Map<string, InstallStatus>>(new Map());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pollAll = useCallback(async () => {
    const updates = await Promise.allSettled(
      installs.map(async (entry) => {
        const status = await pollInstallStatus(entry.nodeId, entry.requestId);
        return { key: entry.requestId, status };
      }),
    );

    setStatuses((prev) => {
      const next = new Map(prev);
      for (const result of updates) {
        if (result.status === 'fulfilled') {
          next.set(result.value.key, result.value.status);
        }
      }
      return next;
    });
  }, [installs]);

  useEffect(() => {
    // Initial poll
    pollAll();

    intervalRef.current = setInterval(pollAll, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [pollAll]);

  // Stop polling when all are terminal
  useEffect(() => {
    if (statuses.size === 0) return;
    const allTerminal = installs.every((entry) => {
      const s = statuses.get(entry.requestId);
      return s && TERMINAL_STATES.has(s.status);
    });
    if (allTerminal && intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;

      // No cache to clear — tools are fetched fresh on every warmup.
    }
  }, [statuses, installs]);

  const handleRetry = async (entry: InstallEntry) => {
    // Re-poll to refresh — actual retry would need re-requesting install
    await pollAll();
  };

  const allDone = installs.every((entry) => {
    const s = statuses.get(entry.requestId);
    return s && TERMINAL_STATES.has(s.status);
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text
          variant="headlineSmall"
          style={[styles.title, { color: theme.colors.onBackground }]}
        >
          Installing {packageName}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {installs.map((entry) => {
          const status = statuses.get(entry.requestId);
          const statusValue: InstallStatusValue = status?.status || 'pending';

          return (
            <Card key={entry.requestId} style={styles.card}>
              <Card.Content style={styles.cardContent}>
                <View style={{ flex: 1 }}>
                  <Text variant="titleMedium">{entry.nodeName}</Text>
                  <Text
                    variant="bodySmall"
                    style={{ color: theme.colors.onSurfaceVariant }}
                  >
                    {statusValue === 'pending' && 'Installing...'}
                    {statusValue === 'completed' && 'Installed successfully'}
                    {statusValue === 'failed' && (status?.error_message || 'Installation failed')}
                    {statusValue === 'expired' && 'Request timed out — node may be offline'}
                  </Text>
                </View>

                <View style={styles.statusIcon}>
                  {statusValue === 'pending' && (
                    <ActivityIndicator size={24} />
                  )}
                  {statusValue === 'completed' && (
                    <Icon source="check-circle" size={28} color="#22c55e" />
                  )}
                  {(statusValue === 'failed' || statusValue === 'expired') && (
                    <Icon source="alert-circle" size={28} color={theme.colors.error} />
                  )}
                </View>
              </Card.Content>

              {statusValue === 'failed' && (
                <Card.Actions>
                  <Button compact onPress={() => handleRetry(entry)}>
                    Refresh
                  </Button>
                </Card.Actions>
              )}
            </Card>
          );
        })}
      </ScrollView>

      {allDone && (
        <View style={styles.footer}>
          <Button
            mode="contained"
            onPress={() => navigation.popToTop()}
            style={{ flex: 1 }}
          >
            Done
          </Button>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 48 },
  header: { paddingHorizontal: 16, marginBottom: 16 },
  title: { fontWeight: 'bold' },
  scroll: { padding: 16, gap: 12, paddingBottom: 100 },
  card: {},
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  statusIcon: { marginLeft: 12 },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: 32,
  },
});

export default InstallProgressScreen;
