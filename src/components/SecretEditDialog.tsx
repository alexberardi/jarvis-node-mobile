import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Button,
  Dialog,
  HelperText,
  Menu,
  Portal,
  Switch,
  Text,
  TextInput,
} from 'react-native-paper';

import { useAuth } from '../auth/AuthContext';
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
  scope: string;
  isSet: boolean;
  currentValue?: string;
  enumValues?: string[];
  presets?: Record<string, Record<string, string>>;
  onPresetsAvailable?: (presetValues: Record<string, string>) => void;
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
  scope,
  isSet,
  currentValue,
  enumValues,
  presets,
  onPresetsAvailable,
}) => {
  const { state: authState } = useAuth();
  const [value, setValue] = useState(currentValue ?? '');
  const [boolValue, setBoolValue] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enumMenuVisible, setEnumMenuVisible] = useState(false);

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
      const configData: Record<string, string> = { [secretKey]: finalValue };
      if (scope === 'user' && authState.user?.id) {
        configData.__user_id__ = String(authState.user.id);
      }
      await encryptAndPushConfig(
        nodeId,
        'settings:secrets',
        configData,
      );
      onSaved();

      if (presets && presets[finalValue] && onPresetsAvailable) {
        onPresetsAvailable(presets[finalValue]);
      }
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

  const hasEnum = enumValues && enumValues.length > 0;

  const renderInput = () => {
    if (valueType === 'bool') {
      return (
        <View style={styles.switchRow}>
          <Text variant="bodyMedium">Enabled</Text>
          <Switch value={boolValue} onValueChange={setBoolValue} />
        </View>
      );
    }

    if (hasEnum) {
      return (
        <Menu
          visible={enumMenuVisible}
          onDismiss={() => setEnumMenuVisible(false)}
          anchor={
            <TextInput
              mode="outlined"
              value={value}
              label={isSet ? 'New value' : 'Value'}
              style={styles.input}
              right={<TextInput.Icon icon="menu-down" onPress={() => setEnumMenuVisible(true)} />}
              onFocus={() => setEnumMenuVisible(true)}
              editable={false}
              placeholder="Select..."
            />
          }
        >
          {enumValues.map((v) => (
            <Menu.Item
              key={v}
              title={v}
              onPress={() => { setValue(v); setEnumMenuVisible(false); }}
            />
          ))}
        </Menu>
      );
    }

    return (
      <TextInput
        label={isSet ? 'New value' : 'Value'}
        value={value}
        onChangeText={setValue}
        mode="outlined"
        secureTextEntry={isSecureField}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={valueType === 'int' ? 'numeric' : 'default'}
        style={styles.input}
        autoFocus
      />
    );
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss}>
        <Dialog.Title>{secretKey}</Dialog.Title>
        <Dialog.Content>
          <Text variant="bodySmall" style={styles.description}>
            {description}
          </Text>

          {renderInput()}

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
