/**
 * Read-only detail view for one record. Top-right Edit button pushes
 * the form screen when the command's mode is "enabled" and any field
 * is editable.
 */
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Card,
  Text,
  useTheme,
} from 'react-native-paper';

import FieldEditor from '../../components/CommandData/FieldEditor';
import { CommandSchema, deleteRecord, getRecord } from '../../api/commandDataApi';
import type { CommandDataStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<CommandDataStackParamList, 'DataBrowserDetail'>;
type Route = RouteProp<CommandDataStackParamList, 'DataBrowserDetail'>;

const RecordDetailScreen = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const theme = useTheme();
  const { nodeId, commandName, recordKey } = route.params;

  const [record, setRecord] = useState<Record<string, unknown> | null>(null);
  const [schema, setSchema] = useState<CommandSchema | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getRecord(nodeId, commandName, recordKey);
      setRecord(result.record);
      setSchema(result.schema);
    } catch (err) {
      console.error('[RecordDetail] load failed', err);
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404) {
        setError('Record not found.');
      } else if (status === 504) {
        setError('Node did not respond.');
      } else {
        setError('Could not load record.');
      }
    } finally {
      setLoading(false);
    }
  }, [nodeId, commandName, recordKey]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const canEdit =
    schema?.mode === 'enabled' &&
    (schema?.fields ?? []).some((f) => f.editable !== false);
  const canDelete = schema?.mode === 'enabled';

  const handleDelete = useCallback(() => {
    const title =
      (record &&
        (typeof record.text === 'string'
          ? record.text
          : Object.values(record).find((v) => typeof v === 'string'))) ||
      'this record';
    Alert.alert(
      'Delete record?',
      `Delete "${title}"? This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteRecord(nodeId, commandName, recordKey);
              navigation.goBack();
            } catch (err) {
              console.error('[RecordDetail] delete failed', err);
              Alert.alert('Could not delete', 'The node rejected the delete.');
            }
          },
        },
      ],
    );
  }, [nodeId, commandName, recordKey, record, navigation]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Record" />
        {canEdit && (
          <Appbar.Action
            icon="pencil"
            onPress={() =>
              navigation.navigate('DataBrowserEdit', { nodeId, commandName, recordKey })
            }
          />
        )}
        {canDelete && (
          <Appbar.Action
            icon="trash-can-outline"
            onPress={handleDelete}
            color={theme.colors.error}
          />
        )}
      </Appbar.Header>
      {loading ? (
        <ActivityIndicator style={styles.spinner} />
      ) : error ? (
        <Text style={[styles.error, { color: theme.colors.error }]}>{error}</Text>
      ) : record && schema ? (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Card>
            <Card.Content>
              {schema.fields.map((spec) => (
                <FieldEditor
                  key={spec.name}
                  spec={spec}
                  value={record[spec.name]}
                  onChange={() => undefined}
                  readOnly
                  displayName={
                    spec.type === 'user_ref'
                      ? (record[`${spec.name}_display`] as string | undefined)
                      : undefined
                  }
                />
              ))}
            </Card.Content>
          </Card>
        </ScrollView>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 16 },
  spinner: { marginTop: 24 },
  error: { marginTop: 24, marginHorizontal: 16, textAlign: 'center' },
});

export default RecordDetailScreen;
