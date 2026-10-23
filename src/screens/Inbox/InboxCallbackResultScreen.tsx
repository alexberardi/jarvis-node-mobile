import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import {
  ActivityIndicator,
  Button,
  Chip,
  Divider,
  Icon,
  Text,
  useTheme,
} from 'react-native-paper';

import {
  getInteractiveCallbackStatus,
  InteractiveCallbackStatus,
  InteractiveElement,
  normalizeInteractiveElements,
} from '../../api/commandCenterApi';
import InteractiveElementsSection from '../../components/InteractiveElementsSection';
import AutonomyRanCard from '../../components/inbox/AutonomyRanCard';
import { useInboxMarkdownStyles } from '../../hooks/useInboxMarkdownStyles';
import { InboxStackParamList } from '../../navigation/types';
import { parseRanCard } from '../../types/autonomyCards';

type ResultRoute = RouteProp<InboxStackParamList, 'InboxCallbackResult'>;

const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 30_000;

const InboxCallbackResultScreen = () => {
  const route = useRoute<ResultRoute>();
  const navigation = useNavigation();
  const theme = useTheme();
  const [status, setStatus] = useState<InteractiveCallbackStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAt = useRef<number>(Date.now());

  const stopPolling = useCallback(() => {
    if (pollTimer.current !== null) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const poll = useCallback(async () => {
    try {
      const next = await getInteractiveCallbackStatus(route.params.jobId);
      setStatus(next);
      if (next.status === 'pending') {
        // Bound the wait — a stuck job shouldn't spin forever.
        if (Date.now() - startedAt.current > POLL_TIMEOUT_MS) {
          setError('Timed out waiting for the result.');
          stopPolling();
          return;
        }
        pollTimer.current = setTimeout(poll, POLL_INTERVAL_MS);
      } else {
        stopPolling();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not load result');
      stopPolling();
    }
  }, [route.params.jobId, stopPolling]);

  useEffect(() => {
    poll();
    return stopPolling;
  }, [poll, stopPolling]);

  const markdownStyles = useInboxMarkdownStyles();

  const header = (
    <View style={[styles.header, { backgroundColor: theme.colors.background }]}>
      <TouchableOpacity testID="back-button" onPress={() => navigation.goBack()} style={styles.backButton}>
        <Icon source="arrow-left" size={24} color={theme.colors.onSurface} />
        <Text variant="bodyLarge" style={{ color: theme.colors.onSurface, marginLeft: 8 }}>
          Back
        </Text>
      </TouchableOpacity>
    </View>
  );

  if (error) {
    return (
      <View style={styles.container}>
        {header}
        <View style={styles.center}>
          <Text testID="error-message" variant="bodyLarge" style={{ color: theme.colors.error }}>{error}</Text>
          <Button testID="retry-button" mode="text" onPress={() => { setError(null); startedAt.current = Date.now(); poll(); }} style={{ marginTop: 8 }}>
            Retry
          </Button>
        </View>
      </View>
    );
  }

  if (!status || status.status === 'pending') {
    return (
      <View style={styles.container}>
        {header}
        <View style={styles.center}>
          <ActivityIndicator testID="pending-indicator" size="large" />
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 12 }}>
            {route.params.title ? `Loading ${route.params.title}…` : 'Loading…'}
          </Text>
        </View>
      </View>
    );
  }

  if (status.status === 'failed' || status.status === 'expired') {
    return (
      <View style={styles.container}>
        {header}
        <View style={styles.center}>
          <Text testID="error-message" variant="bodyLarge" style={{ color: theme.colors.error }}>
            {status.status === 'expired' ? 'This request expired.' : (status.error_message || 'Something went wrong.')}
          </Text>
        </View>
      </View>
    );
  }

  // completed — render the inbox block from context_data
  const inbox = (status.context_data?.inbox as
    | {
        title?: string;
        summary?: string;
        body?: string;
        metadata?: {
          interactive_elements?: InteractiveElement[];
          content_format?: string;
          node_id?: string;
          household_id?: string;
        };
      }
    | undefined) ?? {};

  const elements: InteractiveElement[] = normalizeInteractiveElements(
    inbox.metadata?.interactive_elements,
  );
  const nextTargetNodeId: string | null =
    (inbox.metadata?.node_id as string | undefined) ?? route.params.targetNodeId ?? null;
  // Server-plane follow-up elements need the household — producers put it in
  // the result block's metadata (there's no inbox item to read it from here).
  const nextHouseholdId: string | null =
    (inbox.metadata?.household_id as string | undefined) ?? null;
  const useMarkdown = (inbox.metadata?.content_format ?? 'markdown') === 'markdown';
  const ranCard = parseRanCard(inbox.metadata ?? null);

  return (
    <View style={styles.container}>
      {header}
      <ScrollView contentContainerStyle={styles.content}>
        <Chip testID="status-chip" compact style={styles.chip} textStyle={styles.chipText}>
          drill-down
        </Chip>
        <Text testID="result-heading" variant="headlineSmall" style={styles.heading}>
          {inbox.title || route.params.title || 'Result'}
        </Text>
        {inbox.summary ? (
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 16 }}>
            {inbox.summary}
          </Text>
        ) : null}
        <Divider style={{ marginBottom: 16 }} />
        {ranCard
          ? <AutonomyRanCard data={ranCard} />
          : inbox.body
          ? (useMarkdown
              ? <View testID="result-body"><Markdown style={markdownStyles}>{inbox.body}</Markdown></View>
              : <Text testID="result-body" variant="bodyMedium" selectable>{inbox.body}</Text>)
          : null}
        {elements.length > 0 ? (
          <InteractiveElementsSection
            elements={elements}
            targetNodeId={nextTargetNodeId}
            serverHouseholdId={nextHouseholdId}
          />
        ) : null}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: { flexDirection: 'row', alignItems: 'center' },
  content: { padding: 16, paddingBottom: 48 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  heading: { fontWeight: 'bold', marginTop: 8, marginBottom: 4 },
  chip: { alignSelf: 'flex-start' },
  chipText: { fontSize: 10, lineHeight: 14 },
});

export default InboxCallbackResultScreen;
