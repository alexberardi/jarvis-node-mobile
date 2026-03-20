import React, { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Button, Switch, Text, useTheme } from 'react-native-paper';
import Slider from '@react-native-community/slider';

import { controlDevice } from '../../api/smartHomeApi';
import type { DeviceState } from '../../types/SmartHome';

interface Props {
  householdId: string;
  deviceId: string;
  state: DeviceState;
  onStateChange: () => void;
}

const COLOR_PRESETS: { label: string; rgb: [number, number, number]; hex: string }[] = [
  { label: 'Red', rgb: [255, 0, 0], hex: '#ff0000' },
  { label: 'Orange', rgb: [255, 140, 0], hex: '#ff8c00' },
  { label: 'Yellow', rgb: [255, 220, 0], hex: '#ffdc00' },
  { label: 'Green', rgb: [0, 200, 0], hex: '#00c800' },
  { label: 'Blue', rgb: [0, 100, 255], hex: '#0064ff' },
  { label: 'Purple', rgb: [160, 0, 255], hex: '#a000ff' },
  { label: 'Pink', rgb: [255, 50, 150], hex: '#ff3296' },
];

const DEBOUNCE_MS = 500;

const LightControl: React.FC<Props> = ({
  householdId,
  deviceId,
  state,
  onStateChange,
}) => {
  const theme = useTheme();
  const [loading, setLoading] = useState(false);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);

  const s = state.state ?? {};
  const hasLiveState = state.state != null;
  const isOn = hasLiveState ? (s.state as string) === 'on' : false;
  const brightness = s.brightness as number | undefined;
  const colorTemp = s.color_temp as number | undefined;
  const rgb = s.rgb as [number, number, number] | undefined;

  const features = state.ui_hints?.features ?? [];
  const hasBrightness = features.includes('brightness') || brightness != null;
  const hasColor = features.includes('color') || rgb != null;
  const hasColorTemp = features.includes('color_temp') || colorTemp != null;

  // Debounce refs for sliders
  const brightnessDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const colorTempDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [localBrightness, setLocalBrightness] = useState<number>(brightness ?? 100);
  const [localColorTemp, setLocalColorTemp] = useState<number>(colorTemp ?? 4000);

  // Sync local values when server state changes
  React.useEffect(() => {
    if (brightness != null) setLocalBrightness(brightness);
  }, [brightness]);
  React.useEffect(() => {
    if (colorTemp != null) setLocalColorTemp(colorTemp);
  }, [colorTemp]);

  const sendAction = useCallback(
    async (action: string, data?: Record<string, unknown>) => {
      setLoading(true);
      try {
        const result = await controlDevice(householdId, deviceId, action, data);
        if (result.success) {
          onStateChange();
        } else {
          Alert.alert('Failed', result.error || `Could not ${action.replace('_', ' ')}`);
        }
      } catch (err) {
        Alert.alert('Error', err instanceof Error ? err.message : 'Failed');
      } finally {
        setLoading(false);
      }
    },
    [householdId, deviceId, onStateChange],
  );

  const handleToggle = useCallback(() => {
    sendAction(isOn ? 'turn_off' : 'turn_on');
  }, [isOn, sendAction]);

  const handleBrightnessSlide = useCallback(
    (value: number) => {
      setLocalBrightness(value);
      if (brightnessDebounce.current) clearTimeout(brightnessDebounce.current);
      brightnessDebounce.current = setTimeout(() => {
        sendAction('set_brightness', { brightness: Math.round(value) });
      }, DEBOUNCE_MS);
    },
    [sendAction],
  );

  const handleColorPreset = useCallback(
    (preset: (typeof COLOR_PRESETS)[number]) => {
      setSelectedColor(preset.hex);
      sendAction('set_color', { rgb: preset.rgb });
    },
    [sendAction],
  );

  const handleColorTempSlide = useCallback(
    (value: number) => {
      setLocalColorTemp(value);
      setSelectedColor(null);
      if (colorTempDebounce.current) clearTimeout(colorTempDebounce.current);
      colorTempDebounce.current = setTimeout(() => {
        sendAction('set_color', { color_temp: Math.round(value) });
      }, DEBOUNCE_MS);
    },
    [sendAction],
  );

  // Determine which preset is active (match by closest RGB)
  const activePreset =
    selectedColor ??
    (rgb
      ? COLOR_PRESETS.find(
          (p) =>
            Math.abs(p.rgb[0] - rgb[0]) < 30 &&
            Math.abs(p.rgb[1] - rgb[1]) < 30 &&
            Math.abs(p.rgb[2] - rgb[2]) < 30,
        )?.hex ?? null
      : null);

  return (
    <View style={styles.container}>
      {/* On/Off: toggle switch with live state, buttons without */}
      {hasLiveState ? (
        <View style={styles.toggleRow}>
          <Text variant="bodyLarge">{isOn ? 'On' : 'Off'}</Text>
          <Switch value={isOn} onValueChange={handleToggle} disabled={loading} />
        </View>
      ) : (
        <View style={styles.buttonRow}>
          <Button
            mode="contained"
            onPress={() => sendAction('turn_on')}
            loading={loading}
            disabled={loading}
            icon="lightbulb-on"
            style={styles.rowButton}
          >
            Turn On
          </Button>
          <Button
            mode="contained-tonal"
            onPress={() => sendAction('turn_off')}
            disabled={loading}
            icon="lightbulb-off"
            style={styles.rowButton}
          >
            Turn Off
          </Button>
        </View>
      )}

      {/* Brightness slider */}
      {hasBrightness && (
        <View style={styles.sliderSection}>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            Brightness: {localBrightness}%
          </Text>
          <Slider
            style={styles.slider}
            minimumValue={1}
            maximumValue={100}
            step={1}
            value={localBrightness}
            onValueChange={handleBrightnessSlide}
            disabled={loading || (hasLiveState && !isOn)}
            minimumTrackTintColor={theme.colors.primary}
            maximumTrackTintColor={theme.colors.surfaceVariant}
            thumbTintColor={theme.colors.primary}
          />
        </View>
      )}

      {/* Color presets */}
      {hasColor && (
        <View style={styles.colorSection}>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            Color
          </Text>
          <View style={styles.presetRow}>
            {COLOR_PRESETS.map((preset) => {
              const isActive = activePreset === preset.hex;
              return (
                <Pressable
                  key={preset.hex}
                  onPress={() => handleColorPreset(preset)}
                  disabled={loading || (hasLiveState && !isOn)}
                  style={[
                    styles.presetCircle,
                    { backgroundColor: preset.hex },
                    isActive && styles.presetActive,
                    isActive && { borderColor: theme.colors.primary },
                    ((hasLiveState && !isOn) || loading) && styles.presetDisabled,
                  ]}
                  accessibilityLabel={preset.label}
                />
              );
            })}
          </View>
        </View>
      )}

      {/* Color temperature slider */}
      {hasColorTemp && (
        <View style={styles.sliderSection}>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            Color Temp: {localColorTemp}K
          </Text>
          <View style={styles.colorTempTrack}>
            <Text style={styles.colorTempLabel}>Warm</Text>
            <Slider
              style={styles.slider}
              minimumValue={2500}
              maximumValue={9000}
              step={100}
              value={localColorTemp}
              onValueChange={handleColorTempSlide}
              disabled={loading || (hasLiveState && !isOn)}
              minimumTrackTintColor="#ff9500"
              maximumTrackTintColor="#b0d4ff"
              thumbTintColor={theme.colors.primary}
            />
            <Text style={styles.colorTempLabel}>Cool</Text>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: 16 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  sliderSection: { paddingHorizontal: 4 },
  slider: { width: '100%', height: 40 },
  colorSection: { gap: 8 },
  presetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  presetCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  presetActive: {
    borderWidth: 3,
  },
  presetDisabled: {
    opacity: 0.4,
  },
  colorTempTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  colorTempLabel: {
    fontSize: 10,
    color: '#888',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  rowButton: { flex: 1 },
});

export default LightControl;
