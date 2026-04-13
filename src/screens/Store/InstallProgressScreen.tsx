import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Card,
  Icon,
  IconButton,
  Text,
  useTheme,
} from 'react-native-paper';

import { pollCCInstallStatus, pollInstallStatus, requestInstall } from '../../api/packageInstallApi';
import { pollTestInstallStatus } from '../../api/testInstallApi';
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
const MAX_CONSECUTIVE_FAILURES = 5;

const TERMINAL_STATES: Set<InstallStatusValue> = new Set(['completed', 'failed', 'expired']);

const InstallProgressScreen = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const theme = useTheme();

  const { packageName, commandName, githubRepoUrl, gitTag, mode } = route.params;
  const isTestInstall = mode === 'test';
  const isCCProvider = mode === 'cc-provider';

  const initialInstalls: InstallEntry[] = isCCProvider
    ? [{ requestId: JSON.parse(route.params.installs)[0], nodeId: 'cc', nodeName: 'Command Center' }]
    : JSON.parse(route.params.installs);

  const [installs, setInstalls] = useState<InstallEntry[]>(initialInstalls);
  const [statuses, setStatuses] = useState<Map<string, InstallStatus>>(new Map());
  const [pollError, setPollError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<Set<string>>(new Set());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const consecutiveFailuresRef = useRef(0);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const pollAll = useCallback(async () => {
    try {
      const updates = await Promise.allSettled(
        installs.map(async (entry) => {
          const status = isCCProvider
            ? await pollCCInstallStatus(entry.requestId)
            : isTestInstall
              ? await pollTestInstallStatus(entry.nodeId, entry.requestId)
              : await pollInstallStatus(entry.nodeId, entry.requestId);
          return { key: entry.requestId, status };
        }),
      );

      const allRejected = updates.every((r) => r.status === 'rejected');
      if (allRejected) {
        consecutiveFailuresRef.current += 1;
        if (consecutiveFailuresRef.current >= MAX_CONSECUTIVE_FAILURES) {
          console.error('[InstallProgressScreen] Polling stopped after 5 consecutive failures');
          setPollError('Unable to reach the server. Check your connection and try again.');
          stopPolling();
          return;
        }
      } else {
        consecutiveFailuresRef.current = 0;
        setPollError(null);
      }

      setStatuses((prev) => {
        const next = new Map(prev);
        for (const result of updates) {
          if (result.status === 'fulfilled') {
            next.set(result.value.key, result.value.status);
          }
        }
        return next;
      });
    } catch (error) {
      consecutiveFailuresRef.current += 1;
      console.error('[InstallProgressScreen] Poll error', error);
      if (consecutiveFailuresRef.current >= MAX_CONSECUTIVE_FAILURES) {
        setPollError('Unable to reach the server. Check your connection and try again.');
        stopPolling();
      }
    }
  }, [installs, stopPolling]);

  useEffect(() => {
    // Initial poll
    pollAll();

    intervalRef.current = setInterval(pollAll, POLL_INTERVAL_MS);

    return () => {
      stopPolling();
    };
  }, [pollAll, stopPolling]);

  // Stop polling when all are terminal
  useEffect(() => {
    if (statuses.size === 0) return;
    const allTerminal = installs.every((entry) => {
      const s = statuses.get(entry.requestId);
      return s && TERMINAL_STATES.has(s.status);
    });
    if (allTerminal) {
      stopPolling();
      // No cache to clear — tools are fetched fresh on every warmup.
    }
  }, [statuses, installs, stopPolling]);

  const handleCheckStatus = async () => {
    consecutiveFailuresRef.current = 0;
    setPollError(null);
    await pollAll();
  };

  const handleRetry = async (entry: InstallEntry) => {
    setRetrying((prev) => new Set(prev).add(entry.nodeId));
    try {
      const result = await requestInstall(entry.nodeId, commandName, githubRepoUrl, gitTag);
      const newEntry: InstallEntry = { ...entry, requestId: result.id };

      setInstalls((prev) => prev.map((e) => (e.nodeId === entry.nodeId ? newEntry : e)));
      setStatuses((prev) => {
        const next = new Map(prev);
        next.delete(entry.requestId);
        return next;
      });

      // Resume polling if it was stopped
      if (!intervalRef.current) {
        consecutiveFailuresRef.current = 0;
        setPollError(null);
        intervalRef.current = setInterval(pollAll, POLL_INTERVAL_MS);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Retry failed';
      setStatuses((prev) => {
        const next = new Map(prev);
        next.set(entry.requestId, {
          ...prev.get(entry.requestId)!,
          status: 'failed',
          error_message: msg,
        });
        return next;
      });
    } finally {
      setRetrying((prev) => {
        const next = new Set(prev);
        next.delete(entry.nodeId);
        return next;
      });
    }
  };

  const allDone = installs.every((entry) => {
    const s = statuses.get(entry.requestId);
    return s && TERMINAL_STATES.has(s.status);
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <IconButton
          icon="arrow-left"
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        />
        <Text
          variant="headlineSmall"
          style={[styles.title, { color: theme.colors.onBackground }]}
        >
          {isTestInstall ? 'Testing' : 'Installing'} {packageName || commandName}
        </Text>
      </View>

      {pollError && (
        <View style={styles.errorBanner}>
          <Icon source="alert-circle" size={20} color={theme.colors.error} />
          <Text variant="bodyMedium" style={[styles.errorText, { color: theme.colors.error }]}>
            {pollError}
          </Text>
        </View>
      )}

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
                    {statusValue === 'pending' && (pollError ? 'Status unknown' : 'Installing...')}
                    {statusValue === 'completed' && 'Installed successfully'}
                    {statusValue === 'failed' && (status?.error_message || 'Installation failed')}
                    {statusValue === 'expired' && 'Request timed out — node may be offline'}
                  </Text>
                </View>

                <View style={styles.statusIcon}>
                  {statusValue === 'pending' && !pollError && (
                    <ActivityIndicator size={24} />
                  )}
                  {statusValue === 'pending' && pollError && (
                    <Icon source="help-circle" size={28} color={theme.colors.outline} />
                  )}
                  {statusValue === 'completed' && (
                    <Icon source="check-circle" size={28} color="#22c55e" />
                  )}
                  {(statusValue === 'failed' || statusValue === 'expired') && (
                    <Icon source="alert-circle" size={28} color={theme.colors.error} />
                  )}
                </View>
              </Card.Content>

              {!isTestInstall && !isCCProvider && (statusValue === 'failed' || statusValue === 'expired') && (
                <Card.Actions>
                  <Button
                    compact
                    onPress={() => handleRetry(entry)}
                    loading={retrying.has(entry.nodeId)}
                    disabled={retrying.has(entry.nodeId)}
                  >
                    Retry
                  </Button>
                </Card.Actions>
              )}
            </Card>
          );
        })}
      </ScrollView>

      {(allDone || pollError) && (
        <View style={styles.footer}>
          {pollError && (
            <Button
              mode="outlined"
              onPress={handleCheckStatus}
              style={{ flex: 1, marginRight: 8 }}
            >
              Retry
            </Button>
          )}
          <Button
            mode="contained"
            onPress={() => navigation.popToTop()}
            style={{ flex: 1 }}
          >
            {allDone ? 'Done' : 'Back'}
          </Button>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 48 },
  header: { flexDirection: 'row', alignItems: 'center', paddingRight: 16, marginBottom: 16 },
  backButton: { marginLeft: 4 },
  title: { fontWeight: 'bold', flex: 1 },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    marginBottom: 8,
  },
  errorText: { flex: 1 },
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
    flexDirection: 'row',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: 32,
  },
});

export default InstallProgressScreen;
