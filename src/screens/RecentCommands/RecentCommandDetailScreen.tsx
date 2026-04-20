import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Divider, IconButton, Text, TextInput, useTheme } from 'react-native-paper';

import { listRecentTranscripts, rateTranscript, Rating, Transcript } from '../../api/transcriptsApi';
import { RecentCommandsStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<RecentCommandsStackParamList>;
type Rt = RouteProp<RecentCommandsStackParamList, 'RecentCommandDetail'>;

const RecentCommandDetailScreen = () => {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Rt>();
  const theme = useTheme();

  const [item, setItem] = useState<Transcript | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // Fetch a chunk and find this one; no dedicated single-row endpoint.
        const rows = await listRecentTranscripts({ limit: 200 });
        const found = rows.find((r) => r.id === route.params.transcriptId) ?? null;
        setItem(found);
        setNotes(found?.rating_notes ?? '');
      } catch {
        setError('Could not load command');
      }
    })();
  }, [route.params.transcriptId]);

  const save = useCallback(
    async (rating: Rating) => {
      if (!item) return;
      setSaving(true);
      setError(null);
      try {
        const effective: Rating = item.user_rating === rating && notes === (item.rating_notes ?? '') ? 0 : rating;
        const updated = await rateTranscript(item.id, effective, notes || undefined);
        setItem(updated);
        navigation.goBack();
      } catch {
        setError('Save failed');
      } finally {
        setSaving(false);
      }
    },
    [item, notes, navigation],
  );

  if (!item) {
    return (
      <View style={styles.center}>
        <Text style={{ color: theme.colors.onSurfaceVariant }}>
          {error ?? 'Loading…'}
        </Text>
      </View>
    );
  }

  const upActive = item.user_rating === 1;
  const downActive = item.user_rating === -1;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.label}>You said</Text>
          <Text style={styles.userMessage}>{item.user_message}</Text>

          <Divider style={styles.divider} />
          <Text style={styles.label}>Jarvis did</Text>
          {item.tool_calls && item.tool_calls.length > 0 ? (
            item.tool_calls.map((tc, idx) => (
              <View key={idx} style={styles.toolBlock}>
                <Text style={styles.toolName}>{String(tc.name)}</Text>
                {tc.arguments ? (
                  <Text style={styles.toolArgs}>{JSON.stringify(tc.arguments, null, 2)}</Text>
                ) : null}
              </View>
            ))
          ) : item.assistant_message ? (
            <Text style={styles.assistantMsg}>{item.assistant_message}</Text>
          ) : (
            <Text style={{ color: theme.colors.onSurfaceVariant }}>No tool call recorded.</Text>
          )}

          <Divider style={styles.divider} />
          <Text style={styles.label}>Your rating</Text>
          <View style={styles.ratingRow}>
            <IconButton
              icon={upActive ? 'thumb-up' : 'thumb-up-outline'}
              size={28}
              iconColor={upActive ? theme.colors.primary : theme.colors.onSurfaceVariant}
              disabled={saving}
              onPress={() => save(1)}
            />
            <IconButton
              icon={downActive ? 'thumb-down' : 'thumb-down-outline'}
              size={28}
              iconColor={downActive ? theme.colors.error : theme.colors.onSurfaceVariant}
              disabled={saving}
              onPress={() => save(-1)}
            />
          </View>

          <TextInput
            mode="outlined"
            label="Notes (optional)"
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
            style={styles.notes}
            disabled={saving}
          />

          {error ? <Text style={{ color: theme.colors.error }}>{error}</Text> : null}
        </Card.Content>
      </Card>

      <Button mode="text" onPress={() => navigation.goBack()} style={styles.back}>
        Done
      </Button>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { marginBottom: 12 },
  label: { fontSize: 12, opacity: 0.7, marginTop: 8, marginBottom: 4 },
  userMessage: { fontSize: 16, fontWeight: '500' },
  assistantMsg: { fontSize: 14 },
  divider: { marginVertical: 12 },
  toolBlock: { marginVertical: 4 },
  toolName: { fontSize: 14, fontWeight: '600' },
  toolArgs: { fontFamily: 'Menlo', fontSize: 12, marginTop: 2, opacity: 0.85 },
  ratingRow: { flexDirection: 'row', marginVertical: 4 },
  notes: { marginTop: 8 },
  back: { marginTop: 8 },
});

export default RecentCommandDetailScreen;
