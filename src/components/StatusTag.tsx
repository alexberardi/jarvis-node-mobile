import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';

/** A small status pill: green set, amber needs you, blue personal, grey can't check. */
const StatusTag = ({ label, tone }: { label: string; tone: 'ok' | 'need' | 'me' | 'off' }) => {
  const theme = useTheme();
  const colors = {
    ok: { bg: theme.dark ? '#14532d' : '#dcfce7', fg: theme.dark ? '#bbf7d0' : '#166534' },
    need: { bg: theme.dark ? '#7c2d12' : '#ffedd5', fg: theme.dark ? '#fed7aa' : '#9a3412' },
    me: { bg: theme.dark ? '#0c4a6e' : '#e0f2fe', fg: theme.dark ? '#bae6fd' : '#075985' },
    off: { bg: theme.colors.surfaceVariant, fg: theme.colors.onSurfaceVariant },
  }[tone];
  return (
    <View style={[styles.tag, { backgroundColor: colors.bg }]}>
      <Text style={[styles.tagText, { color: colors.fg }]}>{label}</Text>
    </View>
  );
};

export default StatusTag;

const styles = StyleSheet.create({
  tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  tagText: { fontSize: 11, fontWeight: '600' },
});
