import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Icon,
  IconButton,
  Text,
  TouchableRipple,
  useTheme,
} from 'react-native-paper';

import {
  fetchRoutineHistory,
  RoutineExecution,
  StepResult,
} from '../../api/routineHistoryApi';
import { RoutinesStackParamList } from '../../navigation/types';

type Route = RouteProp<RoutinesStackParamList, 'RoutineHistory'>;

const PAGE_SIZE = 20;

const STATUS_CONFIG: Record<string, { icon: string; color: string }> = {
  success: { icon: 'check-circle', color: '#22c55e' },
  partial: { icon: 'alert-circle', color: '#f59e0b' },
  failure: { icon: 'close-circle', color: '#ef4444' },
};

const formatDuration = (ms: number | null): string => {
  if (ms == null) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

const formatTimestamp = (iso: string): string => {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  if (diffDays === 0) return `Today ${time}`;
  if (diffDays === 1) return `Yesterday ${time}`;
  const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `${dateStr} ${time}`;
};

const StepRow = ({ step }: { step: StepResult }) => {
  const theme = useTheme();
  return (
    <View style={styles.stepRow}>
      <Icon
        source={step.success ? 'check' : 'close'}
        size={16}
        color={step.success ? '#22c55e' : '#ef4444'}
      />
      <View style={{ flex: 1, marginLeft: 8 }}>
        <Text variant="bodySmall" style={{ fontWeight: '500' }}>
          {step.label || step.command}
        </Text>
        {step.error && (
          <Text variant="bodySmall" style={{ color: theme.colors.error, marginTop: 1 }}>
            {step.error}
          </Text>
        )}
      </View>
      {step.duration_ms != null && (
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
          {formatDuration(step.duration_ms)}
        </Text>
      )}
    </View>
  );
};

const ExecutionCard = ({
  execution,
  expanded,
  onToggle,
}: {
  execution: RoutineExecution;
  expanded: boolean;
  onToggle: () => void;
}) => {
  const theme = useTheme();
  const config = STATUS_CONFIG[execution.status] || STATUS_CONFIG.failure;

  return (
    <TouchableRipple onPress={onToggle} style={styles.executionCard}>
      <View>
        <View style={styles.executionHeader}>
          <Icon source={config.icon} size={24} color={config.color} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text variant="bodyMedium" style={{ fontWeight: '500' }}>
              {formatTimestamp(execution.executed_at)}
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {execution.node_room || execution.node_id.slice(0, 8)}
              {execution.duration_ms != null ? ` \u00B7 ${formatDuration(execution.duration_ms)}` : ''}
            </Text>
          </View>
          <Text
            variant="bodySmall"
            style={{
              color: execution.steps_failed > 0 ? config.color : theme.colors.onSurfaceVariant,
              fontWeight: '500',
            }}
          >
            {execution.steps_passed}/{execution.step_count} passed
          </Text>
        </View>

        {expanded && execution.steps && execution.steps.length > 0 && (
          <View style={styles.stepsContainer}>
            {execution.steps.map((step, i) => (
              <StepRow key={i} step={step} />
            ))}
          </View>
        )}

        {expanded && execution.error_summary && (
          <Text
            variant="bodySmall"
            style={[styles.errorSummary, { color: theme.colors.error }]}
          >
            {execution.error_summary}
          </Text>
        )}
      </View>
    </TouchableRipple>
  );
};

const RoutineHistoryScreen = () => {
  const navigation = useNavigation();
  const route = useRoute<Route>();
  const theme = useTheme();
  const { routineId, routineName } = route.params;

  const [executions, setExecutions] = useState<RoutineExecution[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadHistory = useCallback(async (offset = 0, append = false) => {
    try {
      setError(null);
      const data = await fetchRoutineHistory(routineId, {
        limit: PAGE_SIZE,
        offset,
      });
      setExecutions((prev) => append ? [...prev, ...data.executions] : data.executions);
      setTotal(data.total);
    } catch {
      setError('Could not load history');
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, [routineId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadHistory(0, false);
  }, [loadHistory]);

  const loadMore = useCallback(() => {
    if (loadingMore || executions.length >= total) return;
    setLoadingMore(true);
    loadHistory(executions.length, true);
  }, [loadingMore, executions.length, total, loadHistory]);

  const renderExecution = ({ item }: { item: RoutineExecution }) => (
    <ExecutionCard
      execution={item}
      expanded={expandedId === item.id}
      onToggle={() => setExpandedId((prev) => (prev === item.id ? null : item.id))}
    />
  );

  const footer = () => {
    if (loadingMore) {
      return (
        <View style={styles.footerLoader}>
          <ActivityIndicator size="small" />
        </View>
      );
    }
    if (executions.length > 0 && executions.length < total) {
      return (
        <Button mode="text" onPress={loadMore} style={{ marginTop: 8 }}>
          Load more
        </Button>
      );
    }
    return null;
  };

  const emptyComponent = error ? (
    <View style={styles.center}>
      <Text variant="bodyLarge" style={{ color: theme.colors.error, marginBottom: 12 }}>
        {error}
      </Text>
      <Button mode="outlined" onPress={() => loadHistory()}>
        Retry
      </Button>
    </View>
  ) : (
    <View style={styles.center}>
      <Icon source="history" size={48} color={theme.colors.outlineVariant} />
      <Text
        variant="bodyLarge"
        style={{ color: theme.colors.onSurfaceVariant, marginTop: 12, textAlign: 'center' }}
      >
        No runs yet.{'\n'}This routine hasn't been executed by any node.
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.colors.outlineVariant }]}>
        <IconButton icon="arrow-left" onPress={() => navigation.goBack()} />
        <Text variant="headlineSmall" style={{ fontWeight: 'bold', flex: 1 }} numberOfLines={1}>
          {routineName}
        </Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <FlatList
          data={executions}
          keyExtractor={(e) => e.id}
          renderItem={renderExecution}
          contentContainerStyle={executions.length === 0 ? styles.emptyList : styles.list}
          refreshing={refreshing}
          onRefresh={onRefresh}
          ListEmptyComponent={emptyComponent}
          ListFooterComponent={footer}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 48 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  list: { padding: 16, gap: 10, paddingBottom: 32 },
  emptyList: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  executionCard: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: 'transparent',
  },
  executionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepsContainer: {
    marginTop: 10,
    marginLeft: 34,
    gap: 6,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  errorSummary: {
    marginTop: 8,
    marginLeft: 34,
  },
  footerLoader: {
    paddingVertical: 16,
    alignItems: 'center',
  },
});

export default RoutineHistoryScreen;
