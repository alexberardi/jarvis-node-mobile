import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import type { SharedValue } from 'react-native-reanimated';
import {
  Appbar,
  Button,
  Card,
  Chip,
  FAB,
  IconButton,
  Text,
  TouchableRipple,
  useTheme,
} from 'react-native-paper';

import {
  CallContextCatalog,
  CallContextField,
  getCallContext,
  putCallContext,
} from '../../api/callContextApi';
import { CallContextStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<CallContextStackParamList, 'CallContextList'>;

const EMPTY_CATALOG: CallContextCatalog = {
  well_known: [],
  categories: [],
  tiers: [],
};

const categoryLabel = (catalog: CallContextCatalog, value: string): string =>
  catalog.categories.find((c) => c.value === value)?.label ?? value;

const CallContextListScreen = () => {
  const navigation = useNavigation<Nav>();
  const theme = useTheme();
  const [fields, setFields] = useState<CallContextField[]>([]);
  const [catalog, setCatalog] = useState<CallContextCatalog>(EMPTY_CATALOG);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await getCallContext();
      setFields(data.fields);
      setCatalog(data.catalog);
    } catch {
      // A read failure degrades to empty on the server too, so the only way
      // here is the network itself. Show it rather than a misleading blank.
      setError('Could not load your call details');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const handleDelete = useCallback(
    (index: number) => {
      const field = fields[index];
      if (!field) return;
      Alert.alert('Remove', `Remove "${field.label}"?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const next = fields.filter((_, i) => i !== index);
            try {
              // Persist the whole list, then trust the server's canonical
              // echo rather than the optimistic local copy.
              const saved = await putCallContext(next);
              setFields(saved.fields);
              setCatalog(saved.catalog);
            } catch {
              Alert.alert('Error', 'Failed to remove');
            }
          },
        },
      ]);
    },
    [fields],
  );

  const renderCard = (field: CallContextField, index: number) => (
    <Card
      testID={`call-context-card-${index}`}
      style={styles.card}
      onPress={() =>
        navigation.navigate('CallContextEdit', { fields, catalog, index })
      }
    >
      <Card.Content>
        <Text variant="titleMedium" style={styles.label} numberOfLines={1}>
          {field.label}
        </Text>
        <Text variant="bodyMedium" style={styles.value} numberOfLines={1}>
          {field.value}
        </Text>
        <View style={styles.chipRow}>
          <Chip compact style={styles.chip} textStyle={styles.chipText}>
            {categoryLabel(catalog, field.category)}
          </Chip>
          <Chip
            compact
            icon={field.tier === 'state' ? 'volume-high' : 'lock-outline'}
            style={styles.chip}
            textStyle={styles.chipText}
          >
            {field.tier === 'state' ? 'May say freely' : 'Only if asked'}
          </Chip>
        </View>
      </Card.Content>
    </Card>
  );

  const renderItem = ({
    item,
    index,
  }: {
    item: CallContextField;
    index: number;
  }) => {
    const renderRight = (
      _progress: SharedValue<number>,
      _drag: SharedValue<number>,
    ) => (
      <TouchableRipple
        testID={`call-context-delete-${index}`}
        style={styles.deleteAction}
        onPress={() => handleDelete(index)}
      >
        <IconButton icon="delete-outline" iconColor="#fff" size={24} />
      </TouchableRipple>
    );
    return (
      <ReanimatedSwipeable renderRightActions={renderRight} overshootRight={false}>
        {renderCard(item, index)}
      </ReanimatedSwipeable>
    );
  };

  const emptyComponent = (
    <View style={styles.center}>
      <Text
        variant="bodyLarge"
        style={{
          color: error ? theme.colors.error : theme.colors.onSurfaceVariant,
          textAlign: 'center',
        }}
      >
        {error || 'No details saved yet'}
      </Text>
      {!error && (
        <Text variant="bodySmall" style={styles.emptyHint}>
          Store your name, callback number, or insurance details once, and
          Jarvis can use them on a call instead of asking you every time.
          Mark anything private as "only if asked".
        </Text>
      )}
      {error && (
        <Button mode="text" onPress={load} style={{ marginTop: 8 }}>
          Retry
        </Button>
      )}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header mode="small">
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Call details" />
      </Appbar.Header>

      <FlatList
        data={fields}
        keyExtractor={(f, i) => f.key ?? `row-${i}`}
        renderItem={renderItem}
        contentContainerStyle={fields.length === 0 ? styles.emptyList : styles.list}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListEmptyComponent={emptyComponent}
      />

      <FAB
        testID="call-context-add-fab"
        icon="plus"
        style={styles.fab}
        onPress={() => navigation.navigate('CallContextEdit', { fields, catalog })}
        accessibilityLabel="Add detail"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 16, gap: 12, paddingBottom: 96 },
  emptyList: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: { marginBottom: 12 },
  label: { fontWeight: '600', flexShrink: 1 },
  value: { marginTop: 2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { alignSelf: 'flex-start' },
  chipText: { fontSize: 10, lineHeight: 14 },
  emptyHint: { opacity: 0.6, textAlign: 'center', marginTop: 8 },
  deleteAction: {
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    width: 72,
    borderRadius: 12,
    marginLeft: 8,
    marginBottom: 12,
  },
  fab: { position: 'absolute', right: 16, bottom: 24 },
});

export default CallContextListScreen;
