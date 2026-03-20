import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Button,
  Dialog,
  HelperText,
  Portal,
  Switch,
  Text,
  TextInput,
} from 'react-native-paper';

import { encryptAndPushConfig } from '../services/configPushService';

export interface SecretEditDialogProps {
  visible: boolean;
  onDismiss: () => void;
  onSaved: () => void;
  nodeId: string;
  accessToken: string;
  secretKey: string;
  description: string;
  valueType: string;
  isSet: boolean;
  currentValue?: string;
}

const SecretEditDialog: React.FC<SecretEditDialogProps> = ({
  visible,
  onDismiss,
  onSaved,
  nodeId,
  accessToken,
  secretKey,
  description,
  valueType,
  isSet,
  currentValue,
}) => {
  const [value, setValue] = useState(currentValue ?? '');
  const [boolValue, setBoolValue] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    let finalValue: string;
    if (valueType === 'bool') {
      finalValue = boolValue ? 'true' : 'false';
    } else {
      finalValue = value.trim();
    }

    if (!finalValue && valueType !== 'bool') {
      setError('Value cannot be empty');
      setSaving(false);
      return;
    }

    try {
      await encryptAndPushConfig(
        nodeId,
        'settings:secrets',
        { [secretKey]: finalValue },
      );
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    setError(null);

    try {
      await encryptAndPushConfig(
        nodeId,
        'settings:secrets',
        { [secretKey]: '' },
      );
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setSaving(false);
    }
  };

  const isSecureField =
    secretKey.toLowerCase().includes('key') ||
    secretKey.toLowerCase().includes('token') ||
    secretKey.toLowerCase().includes('password') ||
    secretKey.toLowerCase().includes('secret');

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss}>
        <Dialog.Title>{secretKey}</Dialog.Title>
        <Dialog.Content>
          <Text variant="bodySmall" style={styles.description}>
            {description}
          </Text>

          {valueType === 'bool' ? (
            <View style={styles.switchRow}>
              <Text variant="bodyMedium">Enabled</Text>
              <Switch value={boolValue} onValueChange={setBoolValue} />
            </View>
          ) : (
            <TextInput
              label={isSet ? 'New value' : 'Value'}
              value={value}
              onChangeText={setValue}
              mode="outlined"
              secureTextEntry={isSecureField}
              keyboardType={valueType === 'int' ? 'numeric' : 'default'}
              style={styles.input}
              autoFocus
            />
          )}

          {error && (
            <HelperText type="error" visible>
              {error}
            </HelperText>
          )}
        </Dialog.Content>
        <Dialog.Actions>
          {isSet && (
            <Button
              onPress={handleDelete}
              disabled={saving}
              textColor="#ef4444"
            >
              Delete
            </Button>
          )}
          <View style={styles.spacer} />
          <Button onPress={onDismiss} disabled={saving}>
            Cancel
          </Button>
          <Button onPress={handleSave} disabled={saving} loading={saving}>
            Save
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
};

const styles = StyleSheet.create({
  description: {
    opacity: 0.7,
    marginBottom: 16,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  input: {
    marginBottom: 8,
  },
  spacer: {
    flex: 1,
  },
});

export default SecretEditDialog;
