import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Card,
  Chip,
  Icon,
  IconButton,
  Text,
  useTheme,
} from 'react-native-paper';

import {
  deleteProposalSuppression,
  listProposalSuppressions,
} from '../../api/proposalSuppressionsApi';
import { useAuth } from '../../auth/AuthContext';
import { InboxStackParamList } from '../../navigation/types';
import type { ProposalSuppression } from '../../types/ProposalSuppression';

type Nav = NativeStackNavigationProp<InboxStackParamList>;

/**
 * Suppressed suggestions — the household's "never suggest this again" blocklist
 * for agent-proposed action cards. Reached from the Inbox header (where the
 * proposal cards themselves land). Mirrors the Scheduled errands screen: a
 * household-scoped CC-backed list where each row can be removed after a confirm.
 * Un-block confirms first, then refetches so Jarvis may propose it again.
 */
const SuppressedSuggestionsScreen = () => {
  const theme = useTheme();
  const navigation = useNavigation<Nav>();
  const { state: authState } = useAuth();
  const householdId = authState.activeHouseholdId;
  const [unblocking, setUnblocking] = useState<string | null>(null);

  const {
    data: suppressions = [],
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['proposal-suppressions', householdId],
    queryFn: () => listProposalSuppressions(householdId!),
    enabled: !!householdId,
  });

  useFocusEffect(
    useCallback(() => {
      if (householdId) refetch();
    }, [householdId, refetch]),
  );

  // Primary line: prefer the human descriptor, then the source key, then the
  // command — one of these is always present.
  const primaryLine = (s: ProposalSuppression): string =>
    s.descriptor || s.source_key || s.command;

  const formatDate = (iso: string): string => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleUnblock = useCallback(
    (s: ProposalSuppression) => {
      Alert.alert(
        'Un-block suggestion',
        `Let Jarvis suggest "${primaryLine(s)}" again?`,
        [
          { text: 'Keep blocked', style: 'cancel' },
          {
            text: 'Un-block',
            style: 'destructive',
            onPress: async () => {
              setUnblocking(s.id);
              try {
                await deleteProposalSuppression(householdId!, s.id);
                await refetch();
              } catch (e) {
                console.error('[SuppressedSuggestionsScreen] un-block failed', e);
                Alert.alert('Error', 'Could not un-block that suggestion.');
              } finally {
                setUnblocking(null);
              }
            },
          },
        ],
      );
    },
    [householdId, refetch],
  );

  const renderItem = ({ item }: { item: ProposalSuppression }) => (
    <Card testID={`suppression-card-${item.id}`} style={styles.card}>
      <Card.Content>
        <View style={styles.cardHeader}>
          <MaterialCommunityIcons
            name="bell-off-outline"
            size={20}
            color={theme.colors.primary}
            style={{ marginRight: 8 }}
          />
          <Text variant="titleMedium" style={{ flex: 1 }}>
            {primaryLine(item)}
          </Text>
          {unblocking === item.id ? (
            <ActivityIndicator size={20} style={{ marginRight: 8 }} />
          ) : (
            <IconButton
              testID={`suppression-unblock-${item.id}`}
              icon="close-circle-outline"
              size={22}
              onPress={() => handleUnblock(item)}
              style={{ margin: -4 }}
            />
          )}
        </View>
        {!!item.source_key && (
          <Text
            variant="bodySmall"
            style={[styles.subtext, { color: theme.colors.onSurfaceVariant }]}
            numberOfLines={2}
          >
            {item.source_key}
          </Text>
        )}
        <View style={styles.metaRow}>
          <Chip
            compact
            style={styles.badge}
            textStyle={[styles.chipText, { color: theme.colors.primary }]}
          >
            {item.command}
          </Chip>
          {!!item.created_at && (
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {formatDate(item.created_at)}
            </Text>
          )}
        </View>
      </Card.Content>
    </Card>
  );

  const emptyComponent = error ? (
    <View style={styles.center}>
      <Text variant="bodyLarge" style={{ color: theme.colors.error, marginBottom: 12 }}>
        Could not load suppressed suggestions.
      </Text>
      <Button mode="outlined" onPress={() => refetch()}>
        Retry
      </Button>
    </View>
  ) : (
    <View style={styles.center}>
      <Text
        variant="bodyLarge"
        style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}
      >
        Nothing suppressed. When you tell Jarvis “never suggest this again,” the
        blocked suggestion shows up here so you can un-block it later.
      </Text>
    </View>
  );

  const backHeader = (
    <View style={styles.backRow}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
        <Icon source="arrow-left" size={24} color={theme.colors.onSurface} />
        <Text variant="bodyLarge" style={{ color: theme.colors.onSurface, marginLeft: 8 }}>
          Inbox
        </Text>
      </TouchableOpacity>
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.container}>
        {backHeader}
        <Text variant="headlineMedium" style={[styles.title, { color: theme.colors.onBackground }]}>
          Suppressed suggestions
        </Text>
        <View style={styles.center}>
          <ActivityIndicator size="large" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {backHeader}
      <Text variant="headlineMedium" style={[styles.title, { color: theme.colors.onBackground }]}>
        Suppressed suggestions
      </Text>
      <FlatList
        testID="suppression-list"
        data={suppressions}
        keyExtractor={(s) => s.id}
        renderItem={renderItem}
        contentContainerStyle={suppressions.length === 0 ? styles.emptyList : styles.list}
        refreshing={isRefetching}
        onRefresh={() => refetch()}
        ListEmptyComponent={emptyComponent}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 56 },
  backRow: { paddingHorizontal: 16, paddingBottom: 8 },
  backButton: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  title: { fontWeight: 'bold', paddingHorizontal: 16, marginBottom: 12 },
  list: { padding: 16, gap: 12, paddingBottom: 96 },
  emptyList: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  card: {},
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  subtext: { marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  badge: { height: 26 },
  chipText: { fontSize: 11 },
});

export default SuppressedSuggestionsScreen;
