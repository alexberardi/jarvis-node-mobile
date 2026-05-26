import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  Appbar,
  Divider,
  Snackbar,
  Surface,
  Switch,
  Text,
  useTheme,
} from 'react-native-paper';

import { NodesStackParamList } from '../../navigation/types';
import { encryptAndPushConfig } from '../../services/configPushService';
import type { FastPathEntry } from '../../services/settingsDecryptService';

type ScreenRoute = RouteProp<NodesStackParamList, 'FastPathInspect'>;

/** Payload shape passed in via navigation params (JSON-serialized). */
interface CommandWithFastPaths {
  command_name: string;
  fast_paths: FastPathEntry[];
}

/**
 * Inspect + per-pattern toggle screen for a single service group's
 * declared fast-path patterns.
 *
 * Each toggle flip pushes a fast_path_registry config to the node via
 * MQTT (encrypted with K2). The node's _dispatch_fast_path_registry
 * handler upserts the disabled_fast_paths table, and the next call to
 * try_pre_route() picks up the new state without a cache refresh.
 *
 * Local state is updated optimistically; if the push fails, the toggle
 * is rolled back and a snackbar surfaces the error.
 */
const FastPathInspectScreen: React.FC = () => {
  const navigation =
    useNavigation<NativeStackNavigationProp<NodesStackParamList>>();
  const route = useRoute<ScreenRoute>();
  const theme = useTheme();
  const { nodeId, groupName, commandsJson } = route.params;

  const initialCommands = useMemo<CommandWithFastPaths[]>(
    () => JSON.parse(commandsJson) as CommandWithFastPaths[],
    [commandsJson],
  );

  // Local state mirrors the inbound enabled flag per (command, pattern).
  // Optimistic flip; rolled back on push failure.
  const [enabledMap, setEnabledMap] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    for (const cmd of initialCommands) {
      for (const p of cmd.fast_paths) {
        map[`${cmd.command_name}::${p.id}`] = p.enabled;
      }
    }
    return map;
  });

  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());

  const handleToggle = useCallback(
    async (commandName: string, patternId: string, nextEnabled: boolean) => {
      const key = `${commandName}::${patternId}`;
      // Optimistic flip
      setEnabledMap((prev) => ({ ...prev, [key]: nextEnabled }));
      setPendingKeys((prev) => new Set(prev).add(key));

      try {
        await encryptAndPushConfig(nodeId, 'fast_path_registry', {
          command_name: commandName,
          pattern_id: patternId,
          enabled: nextEnabled ? 'true' : 'false',
        });
      } catch (err) {
        // Roll back
        setEnabledMap((prev) => ({ ...prev, [key]: !nextEnabled }));
        const msg = err instanceof Error ? err.message : String(err);
        setSnackbarMessage(`Failed to update pattern: ${msg}`);
      } finally {
        setPendingKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [nodeId],
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title={`Fast-path patterns — ${groupName}`} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text variant="bodyMedium" style={styles.intro}>
          These patterns let voice commands skip the LLM for deterministic
          phrasings. Disable any pattern that collides with another package
          you'd rather have handle the phrase.
        </Text>

        {initialCommands.map((cmd) => (
          <View key={cmd.command_name} style={styles.commandSection}>
            <Text variant="titleSmall" style={styles.commandHeader}>
              {cmd.command_name.replace(/_/g, ' ')}
            </Text>

            <Surface
              style={[
                styles.card,
                { backgroundColor: theme.colors.surface },
              ]}
            >
              {cmd.fast_paths.map((p, i) => {
                const key = `${cmd.command_name}::${p.id}`;
                const isLast = i === cmd.fast_paths.length - 1;
                const isEnabled = enabledMap[key] ?? p.enabled;
                const isPending = pendingKeys.has(key);
                return (
                  <View key={p.id}>
                    <View style={styles.row}>
                      <View style={styles.rowText}>
                        <Text variant="bodyMedium">{p.description}</Text>
                        <Text
                          variant="bodySmall"
                          style={{
                            color: theme.colors.onSurfaceVariant,
                            marginTop: 2,
                          }}
                        >
                          e.g. &ldquo;{p.example}&rdquo;
                        </Text>
                      </View>
                      <Switch
                        value={isEnabled}
                        disabled={isPending}
                        onValueChange={(val) =>
                          handleToggle(cmd.command_name, p.id, val)
                        }
                      />
                    </View>
                    {!isLast && <Divider />}
                  </View>
                );
              })}
            </Surface>
          </View>
        ))}
      </ScrollView>

      <Snackbar
        visible={snackbarMessage !== null}
        onDismiss={() => setSnackbarMessage(null)}
        duration={4000}
      >
        {snackbarMessage}
      </Snackbar>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },
  intro: { marginBottom: 16, lineHeight: 20 },
  commandSection: { marginBottom: 20 },
  commandHeader: {
    marginBottom: 8,
    marginLeft: 4,
    textTransform: 'capitalize',
    fontWeight: '600',
  },
  card: { borderRadius: 12, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  rowText: { flex: 1, marginRight: 16 },
});

export default FastPathInspectScreen;
