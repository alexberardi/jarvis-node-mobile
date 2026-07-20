import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Button,
  HelperText,
  Switch,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';

import {
  createPhoneContact,
  deletePhoneContact,
  listPhoneContacts,
  fieldRejection,
  PhoneContact,
  updatePhoneContact,
} from '../../api/phoneContactsApi';
import { useAuth } from '../../auth/AuthContext';
import type { PhonebookStackParamList } from '../../navigation/types';
import { formatPhoneNumber, validateContactDraft } from '../../utils/phoneContacts';

type Props = NativeStackScreenProps<PhonebookStackParamList, 'PhonebookEdit'>;

const PhonebookEditScreen = ({ navigation, route }: Props) => {
  const theme = useTheme();
  const { state: authState } = useAuth();
  const householdId = authState.activeHouseholdId;
  const contactId = route.params?.contactId;
  const isNew = contactId === undefined;

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [existing, setExisting] = useState<PhoneContact | null>(null);

  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [doNotCall, setDoNotCall] = useState(false);

  // Field-level errors: the required-field checks are local, but the number
  // error usually comes from the server's own validation (E.164, emergency
  // and premium-rate denial), which is the authority.
  const [errors, setErrors] = useState<{ name?: string; number?: string }>({});

  useEffect(() => {
    if (isNew || !householdId || contactId === undefined) return;
    let cancelled = false;
    setLoading(true);
    listPhoneContacts(householdId)
      .then((contacts) => {
        if (cancelled) return;
        const found = contacts.find((c) => c.id === contactId);
        if (!found) {
          Alert.alert('Error', 'Could not load this business', [
            { text: 'OK', onPress: () => navigation.goBack() },
          ]);
          return;
        }
        setExisting(found);
        setName(found.name);
        setNumber(found.number);
        setAddress(found.address ?? '');
        setNotes(found.notes ?? '');
        setDoNotCall(found.do_not_call);
      })
      .catch(() => {
        if (cancelled) return;
        Alert.alert('Error', 'Could not load this business', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isNew, contactId, householdId, navigation]);

  const handleSave = useCallback(async () => {
    if (!householdId) return;
    const draft = { name: name.trim(), number: number.trim() };
    const localErrors = validateContactDraft(draft);
    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      if (isNew) {
        await createPhoneContact(householdId, {
          name: draft.name,
          number: draft.number,
          address: address.trim() || undefined,
          notes: notes.trim() || undefined,
        });
      } else if (contactId !== undefined) {
        await updatePhoneContact(householdId, contactId, {
          name: draft.name,
          number: draft.number,
          address: address.trim(),
          notes: notes.trim(),
          do_not_call: doNotCall,
        });
      }
      navigation.goBack();
    } catch (e) {
      // A rejected number is the one failure the user can fix from here, so
      // it lands on the field instead of a generic error dialog.
      const rejection = fieldRejection(e);
      if (rejection) {
        setErrors({ [rejection.field]: rejection.message });
      } else {
        Alert.alert('Error', e instanceof Error ? e.message : 'Failed to save');
      }
    } finally {
      setSaving(false);
    }
  }, [
    householdId,
    isNew,
    contactId,
    name,
    number,
    address,
    notes,
    doNotCall,
    navigation,
  ]);

  const handleDelete = useCallback(() => {
    if (!householdId || contactId === undefined) return;
    Alert.alert('Remove', 'Remove this business from the phonebook?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePhoneContact(householdId, contactId);
            navigation.goBack();
          } catch {
            Alert.alert('Error', 'Failed to remove');
          }
        },
      },
    ]);
  }, [householdId, contactId, navigation]);

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header mode="small">
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title={isNew ? 'Add Business' : 'Edit Business'} />
        {!isNew && (
          <Appbar.Action
            testID="phone-contact-delete-button"
            icon="delete-outline"
            onPress={handleDelete}
          />
        )}
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text variant="labelLarge" style={styles.label}>
          Name
        </Text>
        <TextInput
          testID="phone-contact-name-input"
          mode="outlined"
          value={name}
          onChangeText={(v) => {
            setName(v);
            if (errors.name) setErrors((p) => ({ ...p, name: undefined }));
          }}
          placeholder="e.g. Tony's Pizzeria"
          disabled={saving}
          maxLength={200}
          error={!!errors.name}
          style={styles.input}
        />
        {!!errors.name && (
          <HelperText type="error" visible testID="phone-contact-name-error">
            {errors.name}
          </HelperText>
        )}

        <Text variant="labelLarge" style={styles.label}>
          Phone number
        </Text>
        <TextInput
          testID="phone-contact-number-input"
          mode="outlined"
          value={number}
          onChangeText={(v) => {
            setNumber(v);
            if (errors.number) setErrors((p) => ({ ...p, number: undefined }));
          }}
          placeholder="+1 555 123 4567"
          keyboardType="phone-pad"
          autoComplete="tel"
          disabled={saving}
          maxLength={32}
          error={!!errors.number}
          style={styles.input}
        />
        {!!errors.number && (
          <HelperText type="error" visible testID="phone-contact-number-error">
            {errors.number}
          </HelperText>
        )}

        <Text variant="labelLarge" style={styles.label}>
          Address
        </Text>
        <TextInput
          testID="phone-contact-address-input"
          mode="outlined"
          value={address}
          onChangeText={setAddress}
          placeholder="Optional"
          disabled={saving}
          maxLength={300}
          style={styles.input}
        />

        <Text variant="labelLarge" style={styles.label}>
          Notes
        </Text>
        <TextInput
          testID="phone-contact-notes-input"
          mode="outlined"
          multiline
          numberOfLines={3}
          value={notes}
          onChangeText={setNotes}
          placeholder="e.g. usual order, ask for Maria"
          disabled={saving}
          maxLength={1000}
          style={styles.input}
        />

        {!isNew && (
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text variant="bodyMedium">Do not call</Text>
              <Text variant="bodySmall" style={styles.hint}>
                Jarvis will refuse to call this business.
              </Text>
            </View>
            <Switch
              testID="phone-contact-dnc-switch"
              value={doNotCall}
              onValueChange={setDoNotCall}
              disabled={saving}
            />
          </View>
        )}

        {existing && (
          <View style={styles.metaRow}>
            <Text variant="bodySmall" style={styles.meta}>
              Dials as: {formatPhoneNumber(existing.number)}
            </Text>
            {!!existing.line_type && (
              <Text variant="bodySmall" style={styles.meta}>
                Line type: {existing.line_type}
              </Text>
            )}
            <Text variant="bodySmall" style={styles.meta}>
              Added: {new Date(existing.created_at).toLocaleDateString()}
            </Text>
          </View>
        )}

        <Button
          testID="phone-contact-save-button"
          mode="contained"
          onPress={handleSave}
          loading={saving}
          disabled={saving || !name.trim() || !number.trim()}
          style={styles.saveButton}
        >
          {isNew ? 'Save' : 'Update'}
        </Button>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16, paddingBottom: 48, gap: 4 },
  label: { fontWeight: '600', marginTop: 16, marginBottom: 8 },
  input: { marginBottom: 4 },
  hint: { opacity: 0.6, marginTop: 4 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    paddingVertical: 4,
    gap: 12,
  },
  metaRow: { marginTop: 24, gap: 4 },
  meta: { opacity: 0.6 },
  saveButton: { marginTop: 24, alignSelf: 'flex-start' },
});

export default PhonebookEditScreen;
