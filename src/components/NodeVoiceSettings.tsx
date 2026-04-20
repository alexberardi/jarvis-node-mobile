import Slider from '@react-native-community/slider';
import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Button,
  Card,
  Divider,
  Switch,
  Text,
  useTheme,
} from 'react-native-paper';

import { updateNodeConfig } from '../api/nodeApi';

interface Props {
  nodeId: string;
}

interface VoiceSettings {
  wake_word_threshold: number;
  silence_threshold: number;
  silence_duration: number;
  barge_in_enabled: boolean;
  follow_up_listen_seconds: number;
}

const DEFAULTS: VoiceSettings = {
  wake_word_threshold: 0.5,
  silence_threshold: 500,
  silence_duration: 0.5,
  barge_in_enabled: true,
  follow_up_listen_seconds: 5,
};

interface SliderRowProps {
  label: string;
  value: number;
  displayValue: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}

const SliderRow = ({ label, value, displayValue, min, max, step, onChange }: SliderRowProps) => {
  const theme = useTheme();
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingHeader}>
        <Text variant="bodyMedium">{label}</Text>
        <Text variant="bodyMedium" style={{ color: theme.colors.primary, fontWeight: '600' }}>
          {displayValue}
        </Text>
      </View>
      <Slider
        style={styles.slider}
        minimumValue={min}
        maximumValue={max}
        step={step}
        value={value}
        onValueChange={onChange}
        minimumTrackTintColor={theme.colors.primary}
        maximumTrackTintColor={theme.colors.surfaceVariant}
        thumbTintColor={theme.colors.primary}
      />
    </View>
  );
};

export const NodeVoiceSettings = ({ nodeId }: Props) => {
  const theme = useTheme();
  const [settings, setSettings] = useState<VoiceSettings>({ ...DEFAULTS });
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const update = useCallback((key: keyof VoiceSettings, value: number | boolean) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const payload: Record<string, number | string | boolean> = {
        wake_word_threshold: settings.wake_word_threshold,
        silence_threshold: settings.silence_threshold,
        silence_duration: settings.silence_duration,
        barge_in_enabled: settings.barge_in_enabled,
        follow_up_listen_seconds: settings.follow_up_listen_seconds,
      };
      await updateNodeConfig(nodeId, payload, true);
      setDirty(false);
    } catch (e) {
      console.error('Failed to update node config:', e);
    } finally {
      setSaving(false);
    }
  }, [nodeId, settings]);

  return (
    <Card style={styles.card}>
      <Card.Title
        title="Voice Settings"
        titleVariant="titleMedium"
        left={(props) => (
          <View {...props} style={[styles.iconCircle, { backgroundColor: theme.colors.primaryContainer }]}>
            <Text style={{ fontSize: 18 }}>
              {'\u{1F399}'}
            </Text>
          </View>
        )}
      />
      <Card.Content>
        <SliderRow
          label="Wake Word Sensitivity"
          value={settings.wake_word_threshold}
          displayValue={settings.wake_word_threshold.toFixed(2)}
          min={0.3}
          max={0.9}
          step={0.05}
          onChange={(v) => update('wake_word_threshold', v)}
        />
        <Text variant="labelSmall" style={styles.hint}>
          Lower = more sensitive (more false wakes). Higher = less sensitive.
        </Text>

        <Divider style={styles.divider} />

        <SliderRow
          label="Silence Threshold (RMS)"
          value={settings.silence_threshold}
          displayValue={String(Math.round(settings.silence_threshold))}
          min={100}
          max={1000}
          step={50}
          onChange={(v) => update('silence_threshold', v)}
        />
        <Text variant="labelSmall" style={styles.hint}>
          Audio below this level counts as silence. Raise for noisy rooms.
        </Text>

        <Divider style={styles.divider} />

        <SliderRow
          label="Silence Duration"
          value={settings.silence_duration}
          displayValue={`${settings.silence_duration.toFixed(1)}s`}
          min={0.3}
          max={2.0}
          step={0.1}
          onChange={(v) => update('silence_duration', v)}
        />
        <Text variant="labelSmall" style={styles.hint}>
          How long silence must last to stop recording. Shorter = faster response.
        </Text>

        <Divider style={styles.divider} />

        <SliderRow
          label="Follow-up Timeout"
          value={settings.follow_up_listen_seconds}
          displayValue={`${settings.follow_up_listen_seconds.toFixed(0)}s`}
          min={0}
          max={10}
          step={1}
          onChange={(v) => update('follow_up_listen_seconds', v)}
        />
        <Text variant="labelSmall" style={styles.hint}>
          Seconds to wait for follow-up speech after a response. 0 = disabled.
        </Text>

        <Divider style={styles.divider} />

        <View style={styles.switchRow}>
          <Text variant="bodyMedium">Barge-in (Interrupt)</Text>
          <Switch
            value={settings.barge_in_enabled}
            onValueChange={(v) => update('barge_in_enabled', v)}
            color={theme.colors.primary}
          />
        </View>
        <Text variant="labelSmall" style={styles.hint}>
          Allow interrupting responses with the wake word.
        </Text>
      </Card.Content>

      {dirty && (
        <Card.Actions>
          <Button
            mode="contained"
            onPress={handleSave}
            loading={saving}
            disabled={saving}
          >
            Apply & Restart Node
          </Button>
        </Card.Actions>
      )}
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginTop: 12,
  },
  settingRow: {
    marginVertical: 4,
  },
  settingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  slider: {
    width: '100%',
    height: 36,
  },
  hint: {
    opacity: 0.6,
    marginBottom: 4,
    marginTop: -2,
  },
  divider: {
    marginVertical: 8,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
