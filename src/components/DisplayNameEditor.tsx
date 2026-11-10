import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, HelperText, Text, TextInput, useTheme } from 'react-native-paper';

import { updateMyDisplayName } from '../api/accountApi';
import { useAuth } from '../auth/AuthContext';
import {
  DISPLAY_NAME_MAX_LENGTH,
  displayNameOf,
  displayNameOnly,
  secondaryNameLine,
} from '../utils/displayName';

/**
 * Account header + "Display name" field for Settings. Shows how the user
 * appears to their household (display name, else username), and lets them
 * set or clear the name via PATCH /auth/me. An empty field clears it.
 */
const DisplayNameEditor = () => {
  const theme = useTheme();
  const { state, updateUser } = useAuth();
  const user = state.user;
  const saved = displayNameOnly(user) ?? '';

  const [draft, setDraft] = useState(saved);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Follow server-confirmed changes (and a different signed-in user).
  useEffect(() => {
    setDraft(saved);
  }, [saved]);

  const dirty = draft.trim() !== saved;

  const handleSave = async () => {
    if (!state.accessToken) return;
    setSaving(true);
    setError('');
    try {
      const me = await updateMyDisplayName(draft, state.accessToken);
      await updateUser({ display_name: me.display_name ?? null });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your display name.');
    } finally {
      setSaving(false);
    }
  };

  const secondary = secondaryNameLine(user);

  return (
    <View>
      <Text variant="bodyLarge" testID="account-display-name">
        {displayNameOf(user)}
      </Text>
      {!!secondary && (
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
          {secondary}
        </Text>
      )}
      <View style={styles.row}>
        <TextInput
          testID="display-name-input"
          mode="outlined"
          dense
          label="Display name"
          placeholder={user?.username || 'How Jarvis and your household see you'}
          value={draft}
          onChangeText={(text) => {
            setDraft(text);
            setError('');
          }}
          maxLength={DISPLAY_NAME_MAX_LENGTH}
          autoCapitalize="words"
          style={styles.input}
        />
        <Button
          testID="display-name-save"
          mode="contained-tonal"
          compact
          onPress={handleSave}
          loading={saving}
          disabled={!dirty || saving}
        >
          Save
        </Button>
      </View>
      <HelperText type={error ? 'error' : 'info'} visible padding="none">
        {error || 'Shown to your household instead of your username. Leave blank to use your username.'}
      </HelperText>
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  input: { flex: 1 },
});

export default DisplayNameEditor;
