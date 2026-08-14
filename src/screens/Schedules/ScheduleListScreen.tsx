import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Card,
  Chip,
  IconButton,
  Text,
  useTheme,
} from 'react-native-paper';

import { cancelSchedule, listSchedules } from '../../api/schedulesApi';
import { useAuth } from '../../auth/AuthContext';
import type { ScheduleView } from '../../types/Schedule';

/**
 * Scheduled errands — the always-there list of the household's one-time +
 * recurring errands (the same rows the "what errands do I have scheduled?"
 * voice card lists), each cancellable. Reached from the Routines tab header
 * (its time-triggered-automation neighbor). Cancel confirms first, then
 * refetches; a recurring errand's cancel note says it will stop repeating.
 */
const ScheduleListScreen = () => {
  const theme = useTheme();
  const { state: authState } = useAuth();
  const householdId = authState.activeHouseholdId;
  const [cancelling, setCancelling] = useState<string | null>(null);

  const {
    data: schedules = [],
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['schedules', householdId],
    queryFn: () => listSchedules(householdId!),
    enabled: !!householdId,
  });

  useFocusEffect(
    useCallback(() => {
      if (householdId) refetch();
    }, [householdId, refetch]),
  );

  const handleCancel = useCallback(
    (s: ScheduleView) => {
      Alert.alert(
        'Cancel errand',
        `Stop "${s.intent}"?${s.is_recurring ? ' It will stop repeating.' : ''}`,
        [
          { text: 'Keep', style: 'cancel' },
          {
            text: 'Cancel errand',
            style: 'destructive',
            onPress: async () => {
              setCancelling(s.id);
              try {
                await cancelSchedule(householdId!, s.id);
                await refetch();
              } catch (e) {
                console.error('[ScheduleListScreen] cancel failed', e);
                Alert.alert('Error', 'Could not cancel that errand.');
              } finally {
                setCancelling(null);
              }
            },
          },
        ],
      );
    },
    [householdId, refetch],
  );

  const renderItem = ({ item }: { item: ScheduleView }) => (
    <Card testID={`schedule-card-${item.id}`} style={styles.card}>
      <Card.Content>
        <View style={styles.cardHeader}>
          <MaterialCommunityIcons
            name={item.is_recurring ? 'calendar-clock' : 'timer-sand'}
            size={20}
            color={theme.colors.primary}
            style={{ marginRight: 8 }}
          />
          <Text variant="titleMedium" style={{ flex: 1 }}>
            {item.intent}
          </Text>
          {cancelling === item.id ? (
            <ActivityIndicator size={20} style={{ marginRight: 8 }} />
          ) : (
            <IconButton
              testID={`schedule-cancel-${item.id}`}
              icon="close-circle-outline"
              size={22}
              onPress={() => handleCancel(item)}
              style={{ margin: -4 }}
            />
          )}
        </View>
        <View style={styles.metaRow}>
          <Chip
            compact
            style={styles.badge}
            textStyle={[styles.chipText, { color: theme.colors.primary }]}
          >
            {item.cadence}
          </Chip>
          {!!item.next_local && (
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Next {item.next_local}
            </Text>
          )}
        </View>
      </Card.Content>
    </Card>
  );

  const emptyComponent = error ? (
    <View style={styles.center}>
      <Text variant="bodyLarge" style={{ color: theme.colors.error, marginBottom: 12 }}>
        Could not load scheduled errands.
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
        No scheduled errands. Ask Jarvis to “schedule an errand” — e.g. “every morning at 8,
        check the weather.”
      </Text>
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text variant="headlineMedium" style={[styles.title, { color: theme.colors.onBackground }]}>
          Scheduled errands
        </Text>
        <View style={styles.center}>
          <ActivityIndicator size="large" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text variant="headlineMedium" style={[styles.title, { color: theme.colors.onBackground }]}>
        Scheduled errands
      </Text>
      <FlatList
        testID="schedule-list"
        data={schedules}
        keyExtractor={(s) => s.id}
        renderItem={renderItem}
        contentContainerStyle={schedules.length === 0 ? styles.emptyList : styles.list}
        refreshing={isRefetching}
        onRefresh={() => refetch()}
        ListEmptyComponent={emptyComponent}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 64 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  title: { fontWeight: 'bold', paddingHorizontal: 16, marginBottom: 12 },
  list: { padding: 16, gap: 12, paddingBottom: 96 },
  emptyList: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  card: {},
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  badge: { height: 26 },
  chipText: { fontSize: 11 },
});

export default ScheduleListScreen;
