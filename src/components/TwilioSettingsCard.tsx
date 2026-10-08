/**
 * "Phone calls (Twilio)" — the household's own Twilio account (jarvisd AD6).
 *
 * Write-only: the server reads the account SID and auth token back as
 * `"********"` once set (null when not), so this card only ever shows WHETHER
 * they are set. The from number is not secret and is shown. The three values
 * are one account and the server refuses to place a call from a partial set,
 * so a save must leave all three set; Remove clears all three.
 *
 * Writes need a household admin (the server answers 403 otherwise), so
 * `canEdit` hides the editor for everyone else.
 */
import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Card, HelperText, Text, TextInput, useTheme } from 'react-native-paper';

import {
  E164_PATTERN,
  TWILIO_KEYS,
  setHouseholdSetting,
  settingErrorMessage,
} from '../api/householdSettingsApi';

export interface TwilioState {
  sidSet: boolean;
  tokenSet: boolean;
  fromNumber: string | null;
}

/** Map the raw GET values to what the card shows (never the secrets). */
export const twilioStateFromSettings = (settings: {
  'phone.twilio_account_sid'?: string | null;
  'phone.twilio_auth_token'?: string | null;
  'phone.twilio_from_number'?: string | null;
}): TwilioState => ({
  sidSet: !!settings['phone.twilio_account_sid'],
  tokenSet: !!settings['phone.twilio_auth_token'],
  fromNumber: settings['phone.twilio_from_number'] || null,
});

/**
 * Drop the spacing people type into phone numbers ("+1 (555) 123-4567"), so
 * what is sent is the bare E.164 form the server checks.
 */
export const normalizePhoneNumber = (raw: string): string => raw.replace(/[\s().-]/g, '');

export const isE164 = (value: string): boolean => E164_PATTERN.test(value);

const missingNames = (s: TwilioState): string[] => {
  const out: string[] = [];
  if (!s.sidSet) out.push('account SID');
  if (!s.tokenSet) out.push('auth token');
  if (!s.fromNumber) out.push('from number');
  return out;
};

interface Props {
  householdId: string;
  state: TwilioState;
  loading: boolean;
  canEdit: boolean;
  /** Re-read the household settings (after any write, successful or not). */
  onChanged: () => Promise<void> | void;
}

const TwilioSettingsCard = ({ householdId, state, loading, canEdit, onChanged }: Props) => {
  const theme = useTheme();
  const [editing, setEditing] = useState(false);
  const [sid, setSid] = useState('');
  const [token, setToken] = useState('');
  const [fromNumber, setFromNumber] = useState('');
  const [fromError, setFromError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const missing = missingNames(state);
  const anySet = missing.length < 3;
  const complete = missing.length === 0;

  const openEditor = () => {
    setSid('');
    setToken('');
    setFromNumber(state.fromNumber ?? '');
    setFromError(null);
    setError(null);
    setEditing(true);
  };

  const closeEditor = () => {
    setSid('');
    setToken('');
    setFromError(null);
    setError(null);
    setEditing(false);
  };

  const nextSid = sid.trim();
  const nextToken = token.trim();
  const nextFrom = normalizePhoneNumber(fromNumber.trim());
  const fromChanged = nextFrom !== (state.fromNumber ?? '');
  const hasChanges = !!nextSid || !!nextToken || fromChanged;

  const handleSave = async () => {
    setError(null);
    setFromError(null);
    // The result must be a whole account: the server won't place a call from a
    // partial set, so don't save one.
    const stillMissing: string[] = [];
    if (!nextSid && !state.sidSet) stillMissing.push('account SID');
    if (!nextToken && !state.tokenSet) stillMissing.push('auth token');
    if (!nextFrom) stillMissing.push('from number');
    if (nextFrom && !isE164(nextFrom)) {
      setFromError('Use international format with the country code, like +15551234567.');
      return;
    }
    if (stillMissing.length > 0) {
      setError(`Enter the ${stillMissing.join(', ')} — calls need all three.`);
      return;
    }

    const writes: Array<[(typeof TWILIO_KEYS)[number], string]> = [];
    if (nextSid) writes.push(['phone.twilio_account_sid', nextSid]);
    if (nextToken) writes.push(['phone.twilio_auth_token', nextToken]);
    if (fromChanged) writes.push(['phone.twilio_from_number', nextFrom]);
    if (writes.length === 0) return;

    setSaving(true);
    try {
      for (const [key, value] of writes) {
        await setHouseholdSetting(householdId, key, value);
      }
      closeEditor();
    } catch (err: unknown) {
      setError(settingErrorMessage(err, 'Could not save the Twilio account.'));
    } finally {
      setSaving(false);
      // Some writes may have landed before a failure; show what the server has.
      await onChanged();
    }
  };

  const clearAll = async () => {
    setSaving(true);
    setError(null);
    try {
      for (const key of TWILIO_KEYS) {
        await setHouseholdSetting(householdId, key, '');
      }
      closeEditor();
    } catch (err: unknown) {
      setError(settingErrorMessage(err, 'Could not remove the Twilio account.'));
    } finally {
      setSaving(false);
      await onChanged();
    }
  };

  const handleRemove = () => {
    Alert.alert(
      'Remove Twilio account',
      'Delete this household’s Twilio credentials from Jarvis? Calls will use the server’s default account if it has one, or stop working.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: clearAll },
      ],
    );
  };

  const muted = { color: theme.colors.onSurfaceVariant };

  return (
    <Card style={styles.card} testID="twilio-card">
      <Card.Content>
        <Text variant="titleMedium" style={styles.sectionTitle}>Phone calls (Twilio)</Text>
        <Text variant="bodySmall" style={[muted, { marginBottom: 12 }]}>
          This household’s own Twilio account. Jarvis uses it to place the phone
          calls you ask for: calls come from your Twilio number and are billed to
          your Twilio account. The account SID and auth token are kept on your
          Jarvis server and are never shown again once saved.
        </Text>

        {loading ? (
          <ActivityIndicator size="small" />
        ) : (
          <>
            <Text variant="bodyMedium" testID="twilio-status">
              {complete
                ? `Set up — calls are placed from ${state.fromNumber}.`
                : anySet
                  ? `Incomplete — missing the ${missing.join(', ')}. Calls won’t go through until all three are set.`
                  : 'Not set up. Calls use the server’s default Twilio account, if the server owner set one.'}
            </Text>
            {anySet && (
              <View style={styles.statusList}>
                <Text variant="bodySmall" style={muted} testID="twilio-sid-status">
                  Account SID: {state.sidSet ? 'set' : 'not set'}
                </Text>
                <Text variant="bodySmall" style={muted} testID="twilio-token-status">
                  Auth token: {state.tokenSet ? 'set' : 'not set'}
                </Text>
                <Text variant="bodySmall" style={muted}>
                  From number: {state.fromNumber ?? 'not set'}
                </Text>
              </View>
            )}

            {canEdit && !editing && (
              <View style={[styles.row, { marginTop: 12 }]}>
                <Button
                  testID="twilio-edit"
                  mode="contained-tonal"
                  icon="phone"
                  onPress={openEditor}
                  disabled={saving}
                  compact
                >
                  {anySet ? 'Replace' : 'Set up'}
                </Button>
                {anySet && (
                  <Button
                    testID="twilio-remove"
                    mode="text"
                    textColor={theme.colors.error}
                    onPress={handleRemove}
                    loading={saving}
                    disabled={saving}
                    style={{ marginLeft: 8 }}
                    compact
                  >
                    Remove
                  </Button>
                )}
              </View>
            )}

            {canEdit && editing && (
              <View style={{ marginTop: 12 }}>
                <TextInput
                  testID="twilio-sid-input"
                  mode="outlined"
                  dense
                  label="Account SID"
                  value={sid}
                  onChangeText={setSid}
                  placeholder={state.sidSet ? 'Leave blank to keep the current one' : 'AC…'}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                />
                <TextInput
                  testID="twilio-token-input"
                  mode="outlined"
                  dense
                  label="Auth token"
                  value={token}
                  onChangeText={setToken}
                  placeholder={state.tokenSet ? 'Leave blank to keep the current one' : undefined}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                />
                <TextInput
                  testID="twilio-from-input"
                  mode="outlined"
                  dense
                  label="From number"
                  value={fromNumber}
                  onChangeText={(v) => {
                    setFromNumber(v);
                    setFromError(null);
                  }}
                  placeholder="+15551234567"
                  keyboardType="phone-pad"
                  autoCorrect={false}
                  error={!!fromError}
                  style={styles.input}
                />
                <HelperText type={fromError ? 'error' : 'info'} visible testID="twilio-from-helper">
                  {fromError ?? 'A number on this Twilio account, with the country code.'}
                </HelperText>
                {error && (
                  <HelperText type="error" visible testID="twilio-error">
                    {error}
                  </HelperText>
                )}
                <View style={[styles.row, { justifyContent: 'flex-end' }]}>
                  <Button testID="twilio-cancel" onPress={closeEditor} disabled={saving} compact>
                    Cancel
                  </Button>
                  <Button
                    testID="twilio-save"
                    mode="contained-tonal"
                    onPress={handleSave}
                    loading={saving}
                    disabled={saving || !hasChanges}
                    style={{ marginLeft: 8 }}
                    compact
                  >
                    Save
                  </Button>
                </View>
              </View>
            )}

            {!editing && error && (
              <HelperText type="error" visible testID="twilio-error">
                {error}
              </HelperText>
            )}

            {!canEdit && (
              <Text variant="bodySmall" style={[muted, { marginTop: 8 }]}>
                Only a household admin can change this.
              </Text>
            )}
          </>
        )}
      </Card.Content>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: { marginBottom: 16 },
  sectionTitle: { fontWeight: '600', marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center' },
  statusList: { marginTop: 6, gap: 2 },
  input: { marginBottom: 8 },
});

export default TwilioSettingsCard;
