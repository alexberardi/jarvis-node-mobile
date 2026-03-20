import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';

import { SmartHomeSetupParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<SmartHomeSetupParamList, 'SmartHomeSetup'>;

const SmartHomeSetupScreen = ({ navigation }: Props) => {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text variant="headlineMedium" style={styles.title}>
          Smart Home Setup
        </Text>
        <Text variant="bodyLarge" style={styles.description}>
          Connect your smart home hub to control devices with voice commands.
        </Text>
      </View>

      <View style={styles.options}>
        <Button
          mode="contained"
          onPress={() => navigation.navigate('HADiscovery')}
          style={styles.button}
          contentStyle={styles.buttonContent}
        >
          Connect Home Assistant
        </Button>

        <Button
          mode="outlined"
          onPress={() => navigation.getParent()?.goBack()}
          style={styles.button}
        >
          Skip for now
        </Button>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  description: { textAlign: 'center', opacity: 0.7, paddingHorizontal: 24 },
  options: { marginBottom: 32, gap: 12 },
  button: {},
  buttonContent: { paddingVertical: 4 },
});

export default SmartHomeSetupScreen;
