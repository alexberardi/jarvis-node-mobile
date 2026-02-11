import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Button, HelperText, Text, TextInput, SegmentedButtons } from 'react-native-paper';

import { useAuth } from '../../auth/AuthContext';
import { useProvisioningContext } from '../../contexts/ProvisioningContext';
import { ProvisioningStackParamList } from '../../navigation/types';
import { ROOM_OPTIONS } from '../../types/Provisioning';

type Props = NativeStackScreenProps<ProvisioningStackParamList, 'EnterPassword'>;

const EnterPasswordScreen = ({ navigation }: Props) => {
  const { state: authState } = useAuth();
  const { selectedNetwork, startProvisioning, isLoading, error, setError } = useProvisioningContext();
  const [password, setPassword] = useState('');
  const [roomName, setRoomName] = useState('living_room');
  const [showPassword, setShowPassword] = useState(false);

  const householdId = authState.activeHouseholdId;

  const handleProvision = async () => {
    if (!householdId) {
      setError('No household selected. Please select a household in settings.');
      return;
    }

    // Node connectivity was already verified during connect() in ScanForNodesScreen
    // The provisioning calls will fail with clear errors if the node isn't reachable
    await startProvisioning(password, roomName, householdId);
    navigation.navigate('ProvisioningProgress');
  };

  const isValid = password.length > 0 && roomName.length > 0 && !!householdId;

  return (
    <>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Configure" />
      </Appbar.Header>
      <ScrollView style={styles.container}>
        <Text variant="titleMedium" style={styles.networkName}>
          Connecting to: {selectedNetwork?.ssid}
        </Text>

        <TextInput
          testID="password-input"
          label="WiFi Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          right={
            <TextInput.Icon
              icon={showPassword ? 'eye-off' : 'eye'}
              onPress={() => setShowPassword(!showPassword)}
            />
          }
          style={styles.input}
        />

        <Text variant="titleSmall" style={styles.roomLabel}>
          Room Location
        </Text>
        <View testID="room-selector">
          <SegmentedButtons
            value={roomName}
            onValueChange={setRoomName}
            buttons={ROOM_OPTIONS.slice(0, 4).map((room) => ({
              value: room,
              label: room.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
            }))}
            style={styles.segmented}
          />
          <SegmentedButtons
            value={roomName}
            onValueChange={setRoomName}
            buttons={ROOM_OPTIONS.slice(4).map((room) => ({
              value: room,
              label: room.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
            }))}
            style={styles.segmented}
          />
        </View>

        {error && (
          <HelperText type="error" visible>
            {error}
          </HelperText>
        )}

        {!householdId && (
          <HelperText type="error" visible>
            No household selected. Please log in and ensure you have a household.
          </HelperText>
        )}

        <Button
          testID="provision-button"
          mode="contained"
          onPress={handleProvision}
          loading={isLoading}
          disabled={!isValid || isLoading}
          style={styles.button}
        >
          Provision Node
        </Button>
      </ScrollView>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  networkName: {
    marginBottom: 24,
    fontWeight: '600',
  },
  input: {
    marginBottom: 24,
  },
  roomLabel: {
    marginBottom: 12,
  },
  segmented: {
    marginBottom: 8,
  },
  button: {
    marginTop: 24,
    marginBottom: 32,
  },
});

export default EnterPasswordScreen;
