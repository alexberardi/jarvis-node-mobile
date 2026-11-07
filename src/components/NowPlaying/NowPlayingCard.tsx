import Slider from '@react-native-community/slider';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Card, IconButton, Text, useTheme } from 'react-native-paper';

import { coverUrl, NodePlayback, PlaybackControl, positionAt } from '../../api/playbackApi';
import { useAuth } from '../../auth/AuthContext';

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** The node's cover from jarvisd, or a music note when there is none or it fails to load. */
export const Cover: React.FC<{ p: NodePlayback; size: number }> = ({ p, size }) => {
  const theme = useTheme();
  const { state } = useAuth();
  const uri = coverUrl(p);
  const [failed, setFailed] = useState<string | null>(null);
  const box = { width: size, height: size, borderRadius: size / 8, backgroundColor: theme.colors.surfaceVariant };
  if (!uri || failed === uri || !state.accessToken) {
    return (
      <View style={[box, styles.blank]} accessibilityElementsHidden importantForAccessibility="no">
        <MaterialCommunityIcons name="music" size={size / 2} color={theme.colors.onSurfaceVariant} />
      </View>
    );
  }
  return (
    <Image
      testID="np-cover"
      style={box}
      source={{ uri, headers: { Authorization: `Bearer ${state.accessToken}` } }}
      accessibilityLabel={p.state.media_album ? `Cover of ${p.state.media_album}` : 'Cover'}
      onError={() => setFailed(uri)}
    />
  );
};

interface Props {
  p: NodePlayback;
  send: (c: PlaybackControl) => void;
  busy?: boolean;
}

/** One node's now playing, with only the controls its source supports. */
const NowPlayingCard: React.FC<Props> = ({ p, send, busy }) => {
  const theme = useTheme();
  const s = p.state;
  const can = (a: string) => s.actions.includes(a);
  const ctl = (c: Omit<PlaybackControl, 'node_id'>) => send({ node_id: p.node_id, ...c });
  const [now, setNow] = useState(Date.now());
  const playing = s.state === 'playing';
  useEffect(() => {
    if (!playing || s.duration === undefined) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [playing, s.duration]);
  const at = positionAt(p, now);
  const repeatLabel = s.repeat === 'one' ? 'Repeat one' : s.repeat === 'all' ? 'Repeat all' : 'Repeat off';

  return (
    <Card mode="outlined" style={styles.card} testID={`np-card-${p.node_id}`}>
      <Card.Content style={styles.content}>
        <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant }}>
          {p.node_name} · {s.context || p.name}
        </Text>
        <View style={styles.head}>
          <Cover p={p} size={88} />
          <View style={styles.titles}>
            <Text variant="titleMedium" numberOfLines={2}>{s.media_title || 'Unknown track'}</Text>
            {!!s.media_artist && (
              <Text variant="bodyMedium" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>
                {s.media_artist}
              </Text>
            )}
            {s.state === 'paused' && <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Paused</Text>}
          </View>
        </View>

        {s.duration !== undefined && at !== undefined && (
          <View>
            <Slider
              testID="np-seek"
              accessibilityLabel="Position"
              minimumValue={0}
              maximumValue={s.duration}
              value={at}
              disabled={!can('seek') || busy}
              onSlidingComplete={(v) => ctl({ action: 'seek', position: v })}
              minimumTrackTintColor={theme.colors.primary}
              maximumTrackTintColor={theme.colors.surfaceVariant}
              thumbTintColor={can('seek') ? theme.colors.primary : 'transparent'}
            />
            <View style={styles.times}>
              <Text variant="labelSmall">{clock(at)}</Text>
              <Text variant="labelSmall">{clock(s.duration)}</Text>
            </View>
          </View>
        )}

        <View style={styles.controls}>
          {s.shuffle !== undefined && can('shuffle') && (
            <IconButton icon="shuffle-variant" accessibilityLabel="Shuffle" mode={s.shuffle ? 'contained' : undefined}
              selected={s.shuffle} accessibilityState={{ selected: s.shuffle }} disabled={busy}
              onPress={() => ctl({ action: 'shuffle' })} />
          )}
          {can('previous') && (
            <IconButton icon="skip-previous" size={30} accessibilityLabel="Previous track" disabled={busy}
              onPress={() => ctl({ action: 'previous' })} />
          )}
          {(playing ? can('pause') : can('play')) && (
            <IconButton icon={playing ? 'pause' : 'play'} size={36} mode="contained"
              accessibilityLabel={playing ? 'Pause' : 'Play'} disabled={busy} testID="np-playpause"
              onPress={() => ctl({ action: playing ? 'pause' : 'play' })} />
          )}
          {can('next') && (
            <IconButton icon="skip-next" size={30} accessibilityLabel="Next track" disabled={busy}
              onPress={() => ctl({ action: 'next' })} />
          )}
          {s.repeat !== undefined && can('repeat') && (
            <IconButton icon={s.repeat === 'one' ? 'repeat-once' : 'repeat'} accessibilityLabel={repeatLabel}
              mode={s.repeat !== 'off' ? 'contained' : undefined} selected={s.repeat !== 'off'}
              accessibilityState={{ selected: s.repeat !== 'off' }} disabled={busy}
              onPress={() => ctl({ action: 'repeat' })} />
          )}
          {s.liked !== undefined && can('like') && (
            <IconButton icon={s.liked ? 'heart' : 'heart-outline'} accessibilityLabel={s.liked ? 'Remove from liked' : 'Like this track'}
              selected={s.liked} accessibilityState={{ selected: s.liked }} disabled={busy}
              onPress={() => ctl({ action: 'like' })} />
          )}
        </View>

        {s.volume !== undefined && can('volume') && (
          <View style={styles.volume}>
            <MaterialCommunityIcons name="volume-high" size={22} color={theme.colors.onSurfaceVariant} />
            <Slider
              testID="np-volume"
              accessibilityLabel="Volume"
              style={styles.flex}
              minimumValue={0}
              maximumValue={100}
              step={1}
              value={s.volume}
              disabled={busy}
              onSlidingComplete={(v) => ctl({ action: 'volume', volume: Math.round(v) })}
              minimumTrackTintColor={theme.colors.primary}
              maximumTrackTintColor={theme.colors.surfaceVariant}
              thumbTintColor={theme.colors.primary}
            />
          </View>
        )}
      </Card.Content>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: { marginBottom: 12 },
  content: { gap: 8 },
  head: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  titles: { flex: 1, gap: 2 },
  blank: { alignItems: 'center', justifyContent: 'center' },
  times: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' },
  volume: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
});

export default NowPlayingCard;
