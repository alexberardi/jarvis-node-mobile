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
  deletePhoneContact,
  listPhoneContacts,
  PhoneContact,
} from '../../api/phoneContactsApi';
import { useAuth } from '../../auth/AuthContext';
import { PhonebookStackParamList } from '../../navigation/types';
import {
  formatPhoneNumber,
  sortContacts,
  sourceIcon,
  sourceLabel,
} from '../../utils/phoneContacts';

type Nav = NativeStackNavigationProp<PhonebookStackParamList, 'PhonebookList'>;

const PhonebookListScreen = () => {
  const navigation = useNavigation<Nav>();
  const theme = useTheme();
  const { state: authState } = useAuth();
  const [items, setItems] = useState<PhoneContact[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const householdId = authState.activeHouseholdId;

  const load = useCallback(async () => {
    if (!householdId) {
      setItems([]);
      return;
    }
    try {
      setError(null);
      const data = await listPhoneContacts(householdId);
      setItems(sortContacts(data));
    } catch {
      setError('Could not load the phonebook');
    }
  }, [householdId]);

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
    (contact: PhoneContact) => {
      if (!householdId) return;
      Alert.alert('Remove', `Remove "${contact.name}" from the phonebook?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePhoneContact(householdId, contact.id);
              setItems((prev) => prev.filter((c) => c.id !== contact.id));
            } catch {
              Alert.alert('Error', 'Failed to remove');
            }
          },
        },
      ]);
    },
    [householdId],
  );

  const renderCard = (contact: PhoneContact) => (
    <Card
      testID={`phone-contact-card-${contact.id}`}
      style={[styles.card, contact.do_not_call && styles.blockedCard]}
      onPress={() =>
        navigation.navigate('PhonebookEdit', { contactId: contact.id })
      }
    >
      <Card.Content>
        <View style={styles.titleRow}>
          <Text variant="titleMedium" style={styles.name} numberOfLines={1}>
            {contact.name}
          </Text>
          {contact.do_not_call && (
            <Chip
              compact
              icon="phone-off"
              testID={`phone-contact-dnc-${contact.id}`}
              textStyle={styles.chipText}
              style={[styles.chip, { backgroundColor: theme.colors.error }]}
            >
              do not call
            </Chip>
          )}
        </View>

        <Text variant="bodyMedium" style={styles.number}>
          {formatPhoneNumber(contact.number)}
        </Text>

        {!!contact.address && (
          <Text variant="bodySmall" style={styles.meta} numberOfLines={1}>
            {contact.address}
          </Text>
        )}

        <View style={styles.chipRow}>
          <Chip
            compact
            icon={sourceIcon(contact.source)}
            textStyle={styles.sourceChipText}
            style={styles.sourceChip}
          >
            {sourceLabel(contact.source)}
          </Chip>
        </View>
      </Card.Content>
    </Card>
  );

  const renderItem = ({ item }: { item: PhoneContact }) => {
    const renderRight = (
      _progress: SharedValue<number>,
      _drag: SharedValue<number>,
    ) => (
      <TouchableRipple
        testID={`phone-contact-delete-${item.id}`}
        style={styles.deleteAction}
        onPress={() => handleDelete(item)}
      >
        <IconButton icon="delete-outline" iconColor="#fff" size={24} />
      </TouchableRipple>
    );
    return (
      <ReanimatedSwipeable renderRightActions={renderRight} overshootRight={false}>
        {renderCard(item)}
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
        {error ||
          (householdId
            ? 'No businesses saved yet'
            : 'Select a household first')}
      </Text>
      {!error && householdId && (
        <Text variant="bodySmall" style={styles.emptyHint}>
          Businesses are saved here automatically after Jarvis calls them
          successfully. You can also add one yourself.
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
        <Appbar.Content title="Phonebook" />
      </Appbar.Header>

      <FlatList
        data={items}
        keyExtractor={(c) => c.id}
        renderItem={renderItem}
        contentContainerStyle={items.length === 0 ? styles.emptyList : styles.list}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListEmptyComponent={emptyComponent}
      />

      {householdId && (
        <FAB
          testID="phone-contact-add-fab"
          icon="plus"
          style={styles.fab}
          onPress={() => navigation.navigate('PhonebookEdit', {})}
          accessibilityLabel="Add business"
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 16, gap: 12, paddingBottom: 96 },
  emptyList: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: { marginBottom: 12 },
  blockedCard: { opacity: 0.7 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  name: { fontWeight: '600', flexShrink: 1 },
  number: { marginTop: 2 },
  meta: { opacity: 0.6, marginTop: 2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: {},
  chipText: { fontSize: 10, lineHeight: 14, color: '#fff' },
  sourceChip: { alignSelf: 'flex-start' },
  sourceChipText: { fontSize: 10, lineHeight: 14 },
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

export default PhonebookListScreen;
