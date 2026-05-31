import Slider from '@react-native-community/slider';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Card,
  Divider,
  Icon,
  Switch,
  Text,
  useTheme,
} from 'react-native-paper';

import {
  pollAmbientNoiseResult,
  triggerAmbientNoiseMeasurement,
  updateNodeConfig,
} from '../api/nodeApi';
import { useSettingsSnapshot } from '../hooks/useSettingsSnapshot';

interface Props {
  nodeId: string;
}

interface VoiceSettings {
  wake_word_threshold: number;
  silence_threshold: number;
  silence_duration: number;
  barge_in_enabled: boolean;
  wake_ack_audio_enabled: boolean;
  follow_up_listen_seconds: number;
  follow_up_silence_duration: number;
  follow_up_min_record_after_onset_secs: number;
  follow_up_min_speech_secs: number;
  volume_percent: number;
  is_muted: boolean;
}

const DEFAULTS: VoiceSettings = {
  wake_word_threshold: 0.5,
  silence_threshold: 5000,
  silence_duration: 0.5,
  barge_in_enabled: true,
  wake_ack_audio_enabled: true,
  follow_up_listen_seconds: 4,
  follow_up_silence_duration: 0.5,
  follow_up_min_record_after_onset_secs: 0.7,
  follow_up_min_speech_secs: 0.3,
  volume_percent: 100,
  is_muted: false,
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
  const seededRef = useRef(false);
  const [calibration, setCalibration] = useState<{
    status: 'idle' | 'measuring' | 'done' | 'error';
    message?: string;
  }>({ status: 'idle' });

  const { snapshot, state: snapshotState } = useSettingsSnapshot({ nodeId });

  useEffect(() => {
    if (seededRef.current) return;
    if (snapshotState !== 'loaded') return;
    const nc = snapshot?.node_config;
    if (!nc) return;
    setSettings({
      wake_word_threshold: nc.wake_word_threshold ?? DEFAULTS.wake_word_threshold,
      silence_threshold: nc.silence_threshold ?? DEFAULTS.silence_threshold,
      silence_duration: nc.silence_duration ?? DEFAULTS.silence_duration,
      barge_in_enabled: nc.barge_in_enabled ?? DEFAULTS.barge_in_enabled,
      wake_ack_audio_enabled: nc.wake_ack_audio_enabled ?? DEFAULTS.wake_ack_audio_enabled,
      follow_up_listen_seconds: nc.follow_up_listen_seconds ?? DEFAULTS.follow_up_listen_seconds,
      follow_up_silence_duration: nc.follow_up_silence_duration ?? DEFAULTS.follow_up_silence_duration,
      follow_up_min_record_after_onset_secs:
        nc.follow_up_min_record_after_onset_secs ?? DEFAULTS.follow_up_min_record_after_onset_secs,
      follow_up_min_speech_secs: nc.follow_up_min_speech_secs ?? DEFAULTS.follow_up_min_speech_secs,
      volume_percent: nc.volume_percent ?? DEFAULTS.volume_percent,
      is_muted: nc.hardware?.is_muted ?? DEFAULTS.is_muted,
    });
    seededRef.current = true;
  }, [snapshot, snapshotState]);

  const update = useCallback((key: keyof VoiceSettings, value: number | boolean) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }, []);

  const handleCalibrate = useCallback(async () => {
    setCalibration({ status: 'measuring' });
    try {
      const { request_id } = await triggerAmbientNoiseMeasurement(nodeId, 3.0);
      // Capture is ~3s — poll up to 15s with a 500ms cadence to absorb MQTT
      // jitter and the round-trip to the node.
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 500));
        const poll = await pollAmbientNoiseResult(nodeId, request_id);
        if (poll.status === 'completed' && poll.result) {
          const r = poll.result;
          if (r.success && r.suggested_silence_threshold) {
            update('silence_threshold', r.suggested_silence_threshold);
            const floor = r.p75_rms != null ? Math.round(r.p75_rms) : null;
            setCalibration({
              status: 'done',
              message: floor != null
                ? `Ambient ~${floor} RMS → set to ${r.suggested_silence_threshold}`
                : `Set to ${r.suggested_silence_threshold}`,
            });
          } else {
            setCalibration({
              status: 'error',
              message: r.error ?? 'Measurement failed',
            });
          }
          return;
        }
      }
      setCalibration({ status: 'error', message: 'Timed out — is the node online?' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Calibration failed';
      setCalibration({ status: 'error', message: msg });
    }
  }, [nodeId, update]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const payload: Record<string, number | string | boolean> = {
        wake_word_threshold: settings.wake_word_threshold,
        silence_threshold: settings.silence_threshold,
        silence_duration: settings.silence_duration,
        barge_in_enabled: settings.barge_in_enabled,
        wake_ack_audio_enabled: settings.wake_ack_audio_enabled,
        follow_up_listen_seconds: settings.follow_up_listen_seconds,
        follow_up_silence_duration: settings.follow_up_silence_duration,
        follow_up_min_record_after_onset_secs: settings.follow_up_min_record_after_onset_secs,
        follow_up_min_speech_secs: settings.follow_up_min_speech_secs,
        volume_percent: settings.volume_percent,
        is_muted: settings.is_muted,
      };
      await updateNodeConfig(nodeId, payload, false);
      setDirty(false);
    } catch (e) {
      console.error('Failed to update node config:', e);
    } finally {
      setSaving(false);
    }
  }, [nodeId, settings]);

  if (snapshotState === 'no_access') {
    return (
      <Card style={styles.card}>
        <Card.Title
          title="Voice Settings"
          titleVariant="titleMedium"
          left={(props) => (
            <View {...props} style={[styles.iconCircle, { backgroundColor: theme.colors.surfaceVariant }]}>
              <Icon source="lock" size={18} color={theme.colors.onSurfaceVariant} />
            </View>
          )}
        />
        <Card.Content>
          <Text variant="bodyMedium" style={{ opacity: 0.7 }}>
            This node was set up on another device. Open the app on that device to view or change its voice settings.
          </Text>
        </Card.Content>
      </Card>
    );
  }

  // Until the snapshot lands, show a placeholder card with a spinner
  // instead of falling back to the in-memory ``DEFAULTS``. The earlier
  // behavior briefly rendered every slider at its default position
  // before the real node config arrived (~500-1500 ms later), creating
  // a flicker that misrepresented the live state.
  if (snapshotState !== 'loaded' || !seededRef.current) {
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
        <Card.Content style={styles.loadingBody}>
          <ActivityIndicator animating size="small" />
          <Text variant="bodySmall" style={{ marginLeft: 12, opacity: 0.7 }}>
            {snapshotState === 'error'
              ? 'Could not reach the node — try again in a moment.'
              : 'Loading current settings from the node…'}
          </Text>
        </Card.Content>
      </Card>
    );
  }

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
          label="Speaker Volume"
          value={settings.volume_percent}
          displayValue={`${Math.round(settings.volume_percent)}%`}
          min={0}
          max={100}
          step={5}
          onChange={(v) => update('volume_percent', v)}
        />
        <Text variant="labelSmall" style={styles.hint}>
          Output level for TTS responses and chimes.
          {settings.volume_percent >= 85 && ' Test in small steps — Line Out can spike.'}
        </Text>

        <View style={styles.switchRow}>
          <Text variant="bodyMedium">Mute</Text>
          <Switch
            value={settings.is_muted}
            onValueChange={(v) => update('is_muted', v)}
            color={theme.colors.primary}
          />
        </View>
        <Text variant="labelSmall" style={styles.hint}>
          Silences TTS + music output. Mic and wake word still active.
        </Text>

        <Divider style={styles.divider} />

        <SliderRow
          label="Wake Word Sensitivity"
          value={settings.wake_word_threshold}
          displayValue={settings.wake_word_threshold.toFixed(2)}
          min={0.2}
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
          min={1000}
          max={10000}
          step={100}
          onChange={(v) => update('silence_threshold', v)}
        />
        <Text variant="labelSmall" style={styles.hint}>
          Audio below this level counts as silence. Raise for noisy rooms
          (fans, AC, server hum). Typical: 3000–6000.
        </Text>
        <View style={styles.calibrateRow}>
          <Button
            mode="outlined"
            icon="auto-fix"
            onPress={handleCalibrate}
            loading={calibration.status === 'measuring'}
            disabled={calibration.status === 'measuring'}
            compact
          >
            {calibration.status === 'measuring' ? 'Measuring…' : 'Set Automatically'}
          </Button>
          {calibration.message ? (
            <Text
              variant="labelSmall"
              style={[
                styles.calibrateMessage,
                calibration.status === 'error' && { color: theme.colors.error },
              ]}
            >
              {calibration.message}
            </Text>
          ) : null}
        </View>
        <Text variant="labelSmall" style={styles.hint}>
          Stays quiet in the room for ~3s and picks a threshold above the
          measured noise floor.
        </Text>

        <Divider style={styles.divider} />

        <SliderRow
          label="Silence Duration"
          value={settings.silence_duration}
          displayValue={`${settings.silence_duration.toFixed(2)}s`}
          min={0.3}
          max={1.5}
          step={0.05}
          onChange={(v) => update('silence_duration', v)}
        />
        <Text variant="labelSmall" style={styles.hint}>
          How long silence must last to stop recording. Shorter = faster response.
        </Text>

        <Divider style={styles.divider} />

        <SliderRow
          label="Follow-up Timeout"
          value={settings.follow_up_listen_seconds}
          displayValue={
            settings.follow_up_listen_seconds === 0
              ? 'Off'
              : `${settings.follow_up_listen_seconds.toFixed(0)}s`
          }
          min={0}
          max={15}
          step={1}
          onChange={(v) => update('follow_up_listen_seconds', v)}
        />
        <Text variant="labelSmall" style={styles.hint}>
          How long to wait for a follow-up reply after a response. 0 = off.
        </Text>

        <Divider style={styles.divider} />

        <SliderRow
          label="Follow-up Silence Duration"
          value={settings.follow_up_silence_duration}
          displayValue={`${settings.follow_up_silence_duration.toFixed(2)}s`}
          min={0.3}
          max={1.0}
          step={0.05}
          onChange={(v) => update('follow_up_silence_duration', v)}
        />
        <Text variant="labelSmall" style={styles.hint}>
          Silence window that ends a follow-up capture. Longer rides through
          natural inter-word pauses; shorter feels snappier.
        </Text>

        <Divider style={styles.divider} />

        <SliderRow
          label="Follow-up Min Record"
          value={settings.follow_up_min_record_after_onset_secs}
          displayValue={`${settings.follow_up_min_record_after_onset_secs.toFixed(1)}s`}
          min={0.5}
          max={2.0}
          step={0.1}
          onChange={(v) => update('follow_up_min_record_after_onset_secs', v)}
        />
        <Text variant="labelSmall" style={styles.hint}>
          Minimum recording after speech starts. Prevents cutting off short
          replies on a fricative tail ("sh", "f").
        </Text>

        <Divider style={styles.divider} />

        <SliderRow
          label="Follow-up Min Speech"
          value={settings.follow_up_min_speech_secs}
          displayValue={`${settings.follow_up_min_speech_secs.toFixed(2)}s`}
          min={0.2}
          max={1.0}
          step={0.05}
          onChange={(v) => update('follow_up_min_speech_secs', v)}
        />
        <Text variant="labelSmall" style={styles.hint}>
          Shortest valid follow-up reply length. Lower catches "yes" / "no";
          higher rejects brief ambient bursts.
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

        <Divider style={styles.divider} />

        <View style={styles.switchRow}>
          <Text variant="bodyMedium">Wake Acknowledgment Audio</Text>
          <Switch
            value={settings.wake_ack_audio_enabled}
            onValueChange={(v) => update('wake_ack_audio_enabled', v)}
            color={theme.colors.primary}
          />
        </View>
        <Text variant="labelSmall" style={styles.hint}>
          Play a spoken ack ("On it.") after the wake word. When off, the
          LED is the only "I heard you" cue — feels snappier for fast-path
          queries that respond in well under a second.
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
            Save Changes
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
  loadingBody: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  calibrateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
    marginBottom: 2,
  },
  calibrateMessage: {
    flexShrink: 1,
    opacity: 0.75,
  },
});
