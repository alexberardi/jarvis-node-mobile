/**
 * SpeakerHATCard — controls for the ReSpeaker 2-Mics Pi HAT v2.
 *
 * Shows what the node detected (HAT presence, LED chain, button, ALSA
 * card name), and lets the user disable LEDs, scale brightness, and
 * preview each LED pattern. Settings persist via update_node_config;
 * pattern previews are ephemeral.
 *
 * Hidden entirely when the node reports hat_detected=false (e.g.,
 * macOS dev node, plain Pi without the HAT) — there's nothing useful
 * to show.
 */

import Slider from '@react-native-community/slider';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Button,
  Card,
  Chip,
  Divider,
  Icon,
  List,
  Switch,
  Text,
  useTheme,
} from 'react-native-paper';

import { previewLedPattern, updateNodeConfig } from '../api/nodeApi';
import { useSettingsSnapshot } from '../hooks/useSettingsSnapshot';

interface Props {
  nodeId: string;
}

// Patterns the node's LED service understands. Keep in sync with
// jarvis-node-setup/services/respeaker_led_service.py:_PATTERNS.
const PATTERNS: { key: string; label: string }[] = [
  { key: 'normal', label: 'Idle' },
  { key: 'wake_detected', label: 'Wake detected' },
  { key: 'listening', label: 'Listening' },
  { key: 'thinking', label: 'Thinking' },
  { key: 'speaking', label: 'Speaking' },
  { key: 'error', label: 'Error' },
  { key: 'not_for_me', label: 'Not for me' },
  { key: 'alert', label: 'Alert' },
  { key: 'muted', label: 'Muted' },
  { key: 'shutdown_warning', label: 'Shutdown' },
  { key: 'off', label: 'Off' },
];

const PREVIEW_SECONDS = 3.0;

export const SpeakerHATCard = ({ nodeId }: Props) => {
  const theme = useTheme();
  const { snapshot, state: snapshotState } = useSettingsSnapshot({ nodeId });
  const seededRef = useRef(false);

  const [ledEnabled, setLedEnabled] = useState(true);
  const [brightness, setBrightness] = useState(100);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState<string | null>(null);

  useEffect(() => {
    if (seededRef.current) return;
    if (snapshotState !== 'loaded') return;
    const nc = snapshot?.node_config;
    if (!nc) return;
    setLedEnabled(nc.led_enabled ?? true);
    setBrightness(nc.led_brightness_percent ?? 100);
    seededRef.current = true;
  }, [snapshot, snapshotState]);

  const hardware = snapshot?.node_config?.hardware;
  const hatDetected = hardware?.hat_detected === true;

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await updateNodeConfig(
        nodeId,
        {
          led_enabled: ledEnabled,
          led_brightness_percent: Math.round(brightness),
        },
        false,
      );
      setDirty(false);
    } catch (e) {
      console.error('Failed to save HAT settings:', e);
    } finally {
      setSaving(false);
    }
  }, [nodeId, ledEnabled, brightness]);

  const handlePreview = useCallback(
    async (pattern: string) => {
      setPreviewing(pattern);
      try {
        await previewLedPattern(nodeId, pattern, PREVIEW_SECONDS);
      } catch (e) {
        console.error('LED preview failed:', e);
      } finally {
        // Match the node-side auto-revert so the chip un-highlights
        // around the time the LEDs actually return to the stable pattern.
        setTimeout(() => setPreviewing(null), PREVIEW_SECONDS * 1000);
      }
    },
    [nodeId],
  );

  // Show nothing while we don't know if the HAT is present (initial
  // load) or once we know it isn't — the rest of HardwareTab covers
  // the non-HAT case.
  if (snapshotState !== 'loaded' || !hatDetected) {
    return null;
  }

  return (
    <Card style={styles.card}>
      <Card.Title
        title="Speaker HAT"
        titleVariant="titleMedium"
        left={(props) => (
          <View
            {...props}
            style={[styles.iconCircle, { backgroundColor: theme.colors.primaryContainer }]}
          >
            <Icon source="speaker" size={20} color={theme.colors.primary} />
          </View>
        )}
        subtitle="ReSpeaker 2-Mics Pi HAT v2"
      />
      <Card.Content>
        {/* Detected hardware */}
        <List.Item
          title="Hardware Detected"
          description="Audio codec, LEDs, and user button"
          left={(props) => <List.Icon {...props} icon="check-circle" color={theme.colors.primary} />}
        />
        {hardware?.audio_card ? (
          <List.Item
            title="Audio Card"
            description={hardware.audio_card}
            left={(props) => <List.Icon {...props} icon="audio-input-rca" />}
          />
        ) : null}
        <List.Item
          title="LED Chain"
          description={hardware?.led_chain_available ? '3× APA102 (RGB)' : 'Not available'}
          left={(props) => (
            <List.Icon
              {...props}
              icon={hardware?.led_chain_available ? 'led-on' : 'led-off'}
              color={hardware?.led_chain_available ? theme.colors.primary : theme.colors.onSurfaceVariant}
            />
          )}
        />
        <List.Item
          title="User Button"
          description={
            hardware?.button_available
              ? 'Short press: read notifications • Hold 3s: shutdown'
              : 'Not available'
          }
          left={(props) => (
            <List.Icon
              {...props}
              icon={hardware?.button_available ? 'gesture-tap-button' : 'button-pointer'}
              color={hardware?.button_available ? theme.colors.primary : theme.colors.onSurfaceVariant}
            />
          )}
        />

        <Divider style={styles.divider} />

        {/* LED enable */}
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text variant="bodyMedium">LEDs Enabled</Text>
            <Text variant="labelSmall" style={styles.hint}>
              Turn off the front LEDs entirely (e.g., at night).
            </Text>
          </View>
          <Switch
            value={ledEnabled}
            onValueChange={(v) => {
              setLedEnabled(v);
              setDirty(true);
            }}
            color={theme.colors.primary}
          />
        </View>

        <Divider style={styles.divider} />

        {/* LED brightness */}
        <View style={[styles.sliderRow, !ledEnabled && { opacity: 0.4 }]}>
          <View style={styles.settingHeader}>
            <Text variant="bodyMedium">LED Brightness</Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.primary, fontWeight: '600' }}>
              {Math.round(brightness)}%
            </Text>
          </View>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={100}
            step={5}
            value={brightness}
            onValueChange={(v) => {
              setBrightness(v);
              setDirty(true);
            }}
            disabled={!ledEnabled}
            minimumTrackTintColor={theme.colors.primary}
            maximumTrackTintColor={theme.colors.surfaceVariant}
            thumbTintColor={theme.colors.primary}
          />
        </View>

        <Divider style={styles.divider} />

        {/* Pattern test */}
        <Text variant="bodyMedium" style={{ marginTop: 4 }}>
          Test LED Patterns
        </Text>
        <Text variant="labelSmall" style={styles.hint}>
          Tap to flash a pattern on the node for {PREVIEW_SECONDS} seconds.
        </Text>
        <View style={styles.chipRow}>
          {PATTERNS.map((p) => (
            <Chip
              key={p.key}
              mode={previewing === p.key ? 'flat' : 'outlined'}
              selected={previewing === p.key}
              onPress={() => handlePreview(p.key)}
              style={styles.chip}
              compact
              disabled={!ledEnabled}
            >
              {p.label}
            </Chip>
          ))}
        </View>
      </Card.Content>

      {dirty && (
        <Card.Actions>
          <Button mode="contained" onPress={handleSave} loading={saving} disabled={saving}>
            Save Changes
          </Button>
        </Card.Actions>
      )}
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 16,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  divider: {
    marginVertical: 8,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 8,
  },
  sliderRow: {
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  chip: {
    marginRight: 4,
    marginBottom: 4,
  },
});
