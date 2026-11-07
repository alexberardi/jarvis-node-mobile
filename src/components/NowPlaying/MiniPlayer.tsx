import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { IconButton, Text, useTheme } from 'react-native-paper';

import { usePlayback, usePlaybackControl } from '../../hooks/usePlayback';
import type { RootStackParamList } from '../../navigation/types';
import { Cover } from './NowPlayingCard';

/**
 * The bar above the tabs while anything plays in the household (P11). It shows the first node
 * that is playing (else the first paused one) and how many more; a tap opens every node's card.
 */
const MiniPlayer: React.FC = () => {
  const theme = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { data = [] } = usePlayback();
  const control = usePlaybackControl();
  const p = data.find((x) => x.state.state === 'playing') ?? data[0];
  if (!p) return null;
  const s = p.state;
  const playing = s.state === 'playing';
  const more = data.length - 1;
  const toggle = playing ? 'pause' : 'play';
  return (
    <Pressable
      testID="mini-player"
      accessibilityRole="button"
      accessibilityLabel={`Now playing on ${p.node_name}: ${s.media_title || p.name}. Open now playing`}
      onPress={() => navigation.navigate('NowPlaying')}
      style={[styles.bar, { backgroundColor: theme.colors.elevation.level2, borderTopColor: theme.colors.outlineVariant }]}
    >
      <Cover p={p} size={40} />
      <View style={styles.text}>
        <Text variant="titleSmall" numberOfLines={1}>{s.media_title || p.name}</Text>
        <Text variant="bodySmall" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>
          {[s.media_artist, p.node_name].filter(Boolean).join(' · ')}
          {more > 0 ? ` · +${more} more` : ''}
        </Text>
      </View>
      {s.actions.includes(toggle) && (
        <IconButton
          icon={playing ? 'pause' : 'play'}
          accessibilityLabel={playing ? 'Pause' : 'Play'}
          disabled={control.isPending}
          onPress={() => control.mutate({ node_id: p.node_id, action: toggle })}
        />
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 12, minHeight: 56, borderTopWidth: 1 },
  text: { flex: 1, minWidth: 0 },
});

export default MiniPlayer;
