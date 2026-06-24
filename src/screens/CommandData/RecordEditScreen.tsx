/**
 * Editable form for one record. Save publishes a PATCH; the server
 * filters the patch to only the editable fields per the schema. Errors
 * come back as either a top-line message or a field-level error
 * (`detail` mentioning the field name) — we surface them inline.
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Button,
  Card,
  Text,
  useTheme,
} from 'react-native-paper';

import FieldEditor from '../../components/CommandData/FieldEditor';
import {
  CommandSchema,
  createRecord,
  getRecord,
  getSchema,
  updateRecord,
} from '../../api/commandDataApi';
import { creatableFields, seedDefaults } from '../../utils/commandDataForm';
import type { CommandDataStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<CommandDataStackParamList, 'DataBrowserEdit'>;
type Route = RouteProp<CommandDataStackParamList, 'DataBrowserEdit'>;

const RecordEditScreen = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const theme = useTheme();
  const { nodeId, commandName, recordKey } = route.params;
  const isCreate = recordKey === undefined;

  const [schema, setSchema] = useState<CommandSchema | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [original, setOriginal] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let mounted = true;
    const loaded = isCreate
      ? getSchema(nodeId, commandName).then((result) => {
          if (!mounted) return;
          setSchema(result);
          setOriginal({});
          setValues(seedDefaults(result.fields));
        })
      : getRecord(nodeId, commandName, recordKey as string).then((result) => {
          if (!mounted) return;
          setSchema(result.schema);
          setOriginal(result.record);
          setValues({ ...result.record });
        });
    loaded
      .catch((err) => {
        if (!mounted) return;
        console.error('[RecordEdit] load failed', err);
        setError(isCreate ? 'Could not load the form.' : 'Could not load record.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [nodeId, commandName, recordKey, isCreate]);

  const buildPatch = useCallback((): Record<string, unknown> => {
    if (!schema) return {};
    const patch: Record<string, unknown> = {};
    for (const field of schema.fields) {
      if (field.editable === false) continue;
      const next = values[field.name];
      if (next !== original[field.name]) {
        patch[field.name] = next;
      }
    }
    return patch;
  }, [schema, values, original]);

  const buildCreatePayload = useCallback((): Record<string, unknown> => {
    if (!schema) return {};
    const payload: Record<string, unknown> = {};
    for (const field of creatableFields(schema.fields)) {
      const next = values[field.name];
      if (next !== undefined) payload[field.name] = next;
    }
    return payload;
  }, [schema, values]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      if (isCreate) {
        await createRecord(nodeId, commandName, buildCreatePayload());
        navigation.goBack();
        return;
      }
      const patch = buildPatch();
      if (Object.keys(patch).length === 0) {
        navigation.goBack();
        return;
      }
      await updateRecord(nodeId, commandName, recordKey as string, patch);
      navigation.goBack();
    } catch (err) {
      console.error('[RecordEdit] save failed', err);
      const status = (err as { response?: { status?: number } })?.response?.status;
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      const message = detail ?? 'Could not save changes.';
      // Best-effort field error attribution: if the message mentions a
      // field name, attach it inline.
      if (schema) {
        const matchedField = schema.fields.find((f) =>
          message.toLowerCase().includes(f.name.toLowerCase()),
        );
        if (matchedField) {
          setFieldErrors({ [matchedField.name]: message });
        } else {
          setError(status === 504 ? 'Node did not respond.' : message);
        }
      } else {
        setError(message);
      }
    } finally {
      setSaving(false);
    }
  }, [
    nodeId,
    commandName,
    recordKey,
    isCreate,
    schema,
    buildPatch,
    buildCreatePayload,
    navigation,
  ]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title={isCreate ? 'Add Record' : 'Edit Record'} />
      </Appbar.Header>
      {loading ? (
        <ActivityIndicator style={styles.spinner} />
      ) : schema ? (
        <ScrollView contentContainerStyle={styles.scroll}>
          {error && (
            <Text style={[styles.error, { color: theme.colors.error }]}>{error}</Text>
          )}
          <Card style={styles.card}>
            <Card.Content>
              {(isCreate ? creatableFields(schema.fields) : schema.fields).map((spec) => (
                <FieldEditor
                  key={spec.name}
                  spec={spec}
                  value={values[spec.name]}
                  onChange={(next) =>
                    setValues((prev) => ({ ...prev, [spec.name]: next }))
                  }
                  error={fieldErrors[spec.name] ?? null}
                  displayName={
                    spec.type === 'user_ref'
                      ? (original[`${spec.name}_display`] as string | undefined)
                      : undefined
                  }
                />
              ))}
            </Card.Content>
          </Card>
          <Button
            mode="contained"
            onPress={handleSave}
            loading={saving}
            disabled={saving}
            style={styles.saveBtn}
          >
            {isCreate ? 'Add' : 'Save'}
          </Button>
        </ScrollView>
      ) : (
        <Text style={[styles.error, { color: theme.colors.error }]}>
          {error ?? 'Schema unavailable.'}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 48 },
  card: { marginBottom: 16 },
  spinner: { marginTop: 24 },
  saveBtn: { marginTop: 8 },
  error: { marginTop: 16, textAlign: 'center', marginHorizontal: 16 },
});

export default RecordEditScreen;
