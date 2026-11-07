import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Text, useTheme } from 'react-native-paper';

import NowPlayingCard from '../../components/NowPlaying/NowPlayingCard';
import { usePlayback, usePlaybackControl } from '../../hooks/usePlayback';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'NowPlaying'>;

/** Everything playing in the household, one card per node (P10). */
const NowPlayingScreen: React.FC<Props> = ({ navigation }) => {
  const theme = useTheme();
  const { data = [], isError } = usePlayback();
  const control = usePlaybackControl();
  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Now playing" />
      </Appbar.Header>
      <ScrollView contentContainerStyle={styles.body}>
        {isError && <Text style={{ color: theme.colors.error }}>Couldn't reach the server.</Text>}
        {control.isError && <Text style={{ color: theme.colors.error }}>That didn't work. The node may be offline.</Text>}
        {data.length === 0 && !isError && (
          <Text style={{ color: theme.colors.onSurfaceVariant }}>Nothing is playing in this household.</Text>
        )}
        {data.map((p) => (
          <NowPlayingCard key={p.node_id} p={p} send={(c) => control.mutate(c)}
            busy={control.isPending && control.variables?.node_id === p.node_id} />
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { padding: 16 },
});

export default NowPlayingScreen;
