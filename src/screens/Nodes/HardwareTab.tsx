/**
 * HardwareTab — physical node hardware management.
 *
 * Sections:
 * - Bluetooth: scan, pair, manage (BluetoothSection)
 * - Speaker HAT: ReSpeaker LED + button controls (only shown when detected)
 * - Voice Recognition: enrollment status + link to VoiceProfileScreen
 * - Device Info: metadata rows moved from Overview (voice mode, platform, etc.)
 * - Voice Settings: NodeVoiceSettings component moved from Overview
 */

import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  Button,
  Card,
  Icon,
  IconButton,
  List,
  Text,
  useTheme,
} from 'react-native-paper';

import { NodeInfo } from '../../api/nodeApi';
import { getVoiceProfileStatus } from '../../api/voiceProfileApi';
import { BluetoothSection } from '../../components/BluetoothSection';
import { NodeVoiceSettings } from '../../components/NodeVoiceSettings';
import { SpeakerHATCard } from '../../components/SpeakerHATCard';
import { useAuth } from '../../auth/AuthContext';
import { RootStackParamList } from '../../navigation/types';

type RootNav = NativeStackNavigationProp<RootStackParamList>;

interface Props {
  nodeId: string;
  node: NodeInfo;
}

export const HardwareTab = ({ nodeId, node }: Props) => {
  const theme = useTheme();
  const navigation = useNavigation<RootNav>();
  const { state: authState } = useAuth();
  const householdId = authState.activeHouseholdId;
  const [hasVoiceProfile, setHasVoiceProfile] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    checkVoiceProfile();
  }, []);

  const checkVoiceProfile = useCallback(async () => {
    if (!householdId) return;
    try {
      const status = await getVoiceProfileStatus(householdId);
      setHasVoiceProfile(status.has_profile);
    } catch {
      setHasVoiceProfile(null);
    }
  }, [householdId]);

  const handleCopyId = useCallback(async () => {
    await Clipboard.setStringAsync(nodeId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [nodeId]);

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      {/* Bluetooth */}
      <BluetoothSection nodeId={nodeId} />

      {/* Speaker HAT (only renders when node reports hat_detected) */}
      <SpeakerHATCard nodeId={nodeId} />

      {/* Voice Recognition */}
      <Card style={styles.card}>
        <Card.Title
          title="Voice Recognition"
          left={(props) => <Icon {...props} source="account-voice" size={24} />}
        />
        <Card.Content>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            {hasVoiceProfile === null
              ? 'Checking enrollment status...'
              : hasVoiceProfile
                ? 'Voice profile enrolled. Jarvis can identify you.'
                : 'No voice profile yet. Enroll so Jarvis can identify you.'}
          </Text>
          <Button
            mode={hasVoiceProfile ? 'outlined' : 'contained'}
            icon={hasVoiceProfile ? 'account-check' : 'account-plus'}
            onPress={() => navigation.navigate('VoiceProfile')}
            style={{ marginTop: 12 }}
          >
            {hasVoiceProfile ? 'Manage Profile' : 'Enroll Voice'}
          </Button>
        </Card.Content>
      </Card>

      {/* Device Info */}
      <Card style={styles.card}>
        <Card.Title
          title="Device Info"
          left={(props) => <Icon {...props} source="information-outline" size={24} />}
        />
        <Card.Content>
          <List.Item
            title="Voice Mode"
            description={node.voice_mode || 'brief'}
            left={(props) => <List.Icon {...props} icon="microphone" />}
          />
          {node.platform && (
            <List.Item
              title="Platform"
              description={node.platform}
              left={(props) => <List.Icon {...props} icon="chip" />}
            />
          )}
          {node.python_version && (
            <List.Item
              title="Python"
              description={node.python_version}
              left={(props) => <List.Icon {...props} icon="language-python" />}
            />
          )}
          {node.adapter_hash && (
            <List.Item
              title="Adapter"
              description={node.adapter_hash}
              left={(props) => <List.Icon {...props} icon="tune" />}
            />
          )}
          <List.Item
            title="Node ID"
            description={nodeId}
            descriptionNumberOfLines={1}
            left={(props) => <List.Icon {...props} icon="identifier" />}
            right={() => (
              <IconButton
                icon={copied ? 'check' : 'content-copy'}
                size={18}
                onPress={handleCopyId}
              />
            )}
          />
        </Card.Content>
      </Card>

      {/* Voice Settings (sliders) */}
      <View style={styles.voiceSettingsWrapper}>
        <NodeVoiceSettings nodeId={nodeId} />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scroll: { paddingBottom: 32 },
  card: { marginHorizontal: 16, marginTop: 16 },
  voiceSettingsWrapper: { marginTop: 8 },
});
