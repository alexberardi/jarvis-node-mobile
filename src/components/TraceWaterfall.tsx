import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

import type { ServiceHop } from '../api/chatApi';

const SERVICE_COLORS: Record<string, string> = {
  cc: '#9e9e9e',
  llm_proxy: '#42a5f5',
  node: '#66bb6a',
  tts: '#ffa726',
  whisper: '#ab47bc',
};

const SERVICE_LABELS: Record<string, string> = {
  cc: 'Command Center',
  llm_proxy: 'LLM Proxy',
  node: 'Node',
  tts: 'TTS',
  whisper: 'Whisper',
};

interface TraceWaterfallProps {
  hops: ServiceHop[];
  totalMs: number;
}

const TraceWaterfall: React.FC<TraceWaterfallProps> = ({ hops, totalMs }) => {
  const theme = useTheme();

  if (!hops.length || totalMs <= 0) return null;

  return (
    <View style={styles.container}>
      {hops.map((hop, i) => {
        const pct = Math.min((hop.duration_ms / totalMs) * 100, 100);
        const color = SERVICE_COLORS[hop.service] ?? '#9e9e9e';
        const isError = hop.status === 'error';
        const label = SERVICE_LABELS[hop.service] ?? hop.service;

        const durationLabel = hop.duration_ms < 1000
          ? `${Math.round(hop.duration_ms)}ms`
          : `${(hop.duration_ms / 1000).toFixed(1)}s`;

        return (
          <View key={`${hop.service}-${i}`} style={styles.row}>
            <View style={styles.labelRow}>
              <View style={[styles.dot, { backgroundColor: isError ? theme.colors.error : color }]} />
              <Text
                variant="labelSmall"
                numberOfLines={1}
                style={[styles.label, { color: theme.colors.onSurface }]}
              >
                {label}
              </Text>
              <Text
                variant="labelSmall"
                style={[styles.duration, { color: theme.colors.onSurface, opacity: 0.5 }]}
              >
                {durationLabel}
              </Text>
            </View>
            <View style={styles.barContainer}>
              <View
                style={[
                  styles.bar,
                  {
                    width: `${Math.max(pct, 2)}%`,
                    backgroundColor: isError ? theme.colors.error : color,
                  },
                ]}
              />
            </View>
          </View>
        );
      })}

      {/* Connector lines between hops */}
      {hops.length > 1 && (
        <View style={styles.flowHint}>
          <Text
            variant="labelSmall"
            style={{ color: theme.colors.onSurface, opacity: 0.3, fontSize: 9 }}
          >
            {hops.map((h) => SERVICE_LABELS[h.service] ?? h.service).join(' → ')}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 5,
  },
  row: {
    gap: 2,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: 11,
    flex: 1,
  },
  duration: {
    fontSize: 11,
    textAlign: 'right',
  },
  barContainer: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.06)',
    overflow: 'hidden',
    marginLeft: 12,
  },
  bar: {
    height: '100%',
    borderRadius: 2,
  },
  flowHint: {
    marginTop: 2,
    alignItems: 'center',
  },
});

export default TraceWaterfall;
