/**
 * List records for a command on a node. Each row uses the command's
 * `display_summary(record)` for the icon/title/subtitle. Swipe-left
 * deletes (with confirmation). Tap pushes to the read-only detail.
 */
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { FlatList } from 'react-native-gesture-handler';
import {
  ActivityIndicator,
  Appbar,
  Divider,
  HelperText,
  IconButton,
  List,
  Text,
  useTheme,
} from 'react-native-paper';

import {
  DataRecord,
  deleteRecord,
  listRecords,
} from '../../api/commandDataApi';
import type { CommandDataStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<CommandDataStackParamList, 'DataBrowserRecords'>;
type Route = RouteProp<CommandDataStackParamList, 'DataBrowserRecords'>;

const RecordsListScreen = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const theme = useTheme();
  const { nodeId, commandName } = route.params;

  const [records, setRecords] = useState<DataRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listRecords(nodeId, commandName);
      setRecords(result.records);
      setTruncated(result.truncated);
    } catch (err) {
      console.error('[RecordsList] load failed', err);
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 504) {
        setError('Node did not respond. It may be offline.');
      } else if (status === 404) {
        setError('Command not found on this node.');
      } else {
        setError('Could not load records.');
      }
    } finally {
      setLoading(false);
    }
  }, [nodeId, commandName]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const confirmDelete = useCallback(
    (record: DataRecord) => {
      Alert.alert(
        'Delete record?',
        `Delete "${record.summary.title}"? This can't be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteRecord(nodeId, commandName, record.key);
                // Optimistic local removal so the row disappears immediately.
                setRecords((prev) => prev.filter((r) => r.key !== record.key));
              } catch (err) {
                console.error('[RecordsList] delete failed', err);
                Alert.alert('Could not delete', 'The node rejected the delete.');
              }
            },
          },
        ],
      );
    },
    [nodeId, commandName],
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title={commandName} />
      </Appbar.Header>
      {loading ? (
        <ActivityIndicator style={styles.spinner} />
      ) : error ? (
        <Text style={[styles.error, { color: theme.colors.error }]}>{error}</Text>
      ) : records.length === 0 ? (
        <Text style={[styles.empty, { color: theme.colors.onSurfaceVariant }]}>
          No records stored.
        </Text>
      ) : (
        <FlatList
          data={records}
          keyExtractor={(r) => r.key}
          ItemSeparatorComponent={() => <Divider />}
          ListFooterComponent={
            truncated ? (
              <HelperText type="info" style={styles.truncated}>
                Showing the first {records.length} records. Older ones are
                hidden; ask via voice if you need them.
              </HelperText>
            ) : null
          }
          renderItem={({ item }) => (
            <List.Item
              title={item.summary.title}
              description={item.summary.subtitle ?? undefined}
              left={(props) => <List.Icon {...props} icon={item.summary.icon || 'tag'} />}
              right={() => (
                <IconButton
                  icon="trash-can-outline"
                  size={22}
                  iconColor={theme.colors.error}
                  onPress={() => confirmDelete(item)}
                  accessibilityLabel="Delete record"
                />
              )}
              onPress={() =>
                navigation.navigate('DataBrowserDetail', {
                  nodeId,
                  commandName,
                  recordKey: item.key,
                })
              }
              onLongPress={() => confirmDelete(item)}
            />
          )}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  spinner: { marginTop: 24 },
  empty: { marginTop: 24, textAlign: 'center' },
  error: { marginTop: 24, marginHorizontal: 16, textAlign: 'center' },
  truncated: { textAlign: 'center', padding: 16 },
});

export default RecordsListScreen;
