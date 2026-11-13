/**
 * "Discord": let people message Jarvis from anywhere through a Discord bot (jarvisd
 * docs/discord-bridge.md). Two parts:
 *
 *  - The bot (admin only): the bot token, the Discord server and channel IDs, and a switch.
 *    The token is write-only like the Twilio credentials: the server answers `"********"` once
 *    it is set, so this card only ever shows WHETHER it is set. "Paste details" fills the fields
 *    from the clipboard, so the token and IDs go in with one paste from a password manager.
 *  - Me (every member): link my Discord account with a one-time code, choose voice replies and
 *    whether reminders and alarms come to my Discord messages (off by default), or unlink.
 */
import * as Clipboard from 'expo-clipboard';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Card,
  Chip,
  HelperText,
  SegmentedButtons,
  Switch,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';

import {
  createDiscordLinkCode,
  getDiscordStatus,
  setDiscordPrefs,
  unlinkDiscord,
  type DiscordLinkCode,
  type DiscordStatus,
  type VoiceReplies,
} from '../api/discordApi';
import { listNodes, type NodeInfo } from '../api/nodeApi';
import {
  DISCORD_KEYS,
  setHouseholdSetting,
  settingErrorMessage,
} from '../api/householdSettingsApi';
import { DISCORD_ID_PATTERN, parseDiscordDetails } from '../services/discordImport';

/** What the household settings say about the bot (never the token itself). */
export interface DiscordBotState {
  /** The server knows the Discord settings (false on a server without the bridge). */
  supported: boolean;
  enabled: boolean;
  tokenSet: boolean;
  guildId: string | null;
  channelId: string | null;
  voiceChannelId: string | null;
}

export const discordStateFromSettings = (settings: {
  'discord.enabled'?: boolean;
  'discord.bot_token'?: string | null;
  'discord.guild_id'?: string | null;
  'discord.channel_id'?: string | null;
  'discord.voice_channel_id'?: string | null;
}): DiscordBotState => ({
  supported: 'discord.enabled' in settings,
  enabled: settings['discord.enabled'] === true,
  tokenSet: !!settings['discord.bot_token'],
  guildId: settings['discord.guild_id'] || null,
  channelId: settings['discord.channel_id'] || null,
  voiceChannelId: settings['discord.voice_channel_id'] || null,
});

const nodeLabel = (n: NodeInfo): string => n.name || n.room || n.node_id;

interface Props {
  householdId: string;
  state: DiscordBotState;
  loading: boolean;
  canEdit: boolean;
  /** Re-read the household settings (after any write, successful or not). */
  onChanged: () => Promise<void> | void;
}

const DiscordSettingsCard = ({ householdId, state, loading, canEdit, onChanged }: Props) => {
  const theme = useTheme();
  const muted = { color: theme.colors.onSurfaceVariant };

  // --- the bot (admin) ---
  const [editing, setEditing] = useState(false);
  const [token, setToken] = useState('');
  const [guildId, setGuildId] = useState('');
  const [channelId, setChannelId] = useState('');
  const [voiceChannelId, setVoiceChannelId] = useState('');
  const [botError, setBotError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const openEditor = () => {
    setToken('');
    setGuildId(state.guildId ?? '');
    setChannelId(state.channelId ?? '');
    setVoiceChannelId(state.voiceChannelId ?? '');
    setBotError(null);
    setEditing(true);
  };
  const closeEditor = () => {
    setToken('');
    setBotError(null);
    setEditing(false);
  };

  const pasteDetails = async () => {
    setBotError(null);
    const text = await Clipboard.getStringAsync();
    const { details, errors } = parseDiscordDetails(text);
    if (details.token) setToken(details.token);
    if (details.guildId) setGuildId(details.guildId);
    if (details.channelId) setChannelId(details.channelId);
    if (details.voiceChannelId) setVoiceChannelId(details.voiceChannelId);
    if (errors.length > 0) setBotError(errors.join(' '));
  };

  const idError = (v: string, required: boolean): string | null => {
    const t = v.trim();
    if (!t) return required ? 'Required' : null;
    return DISCORD_ID_PATTERN.test(t) ? null : 'A Discord ID is 15 to 22 digits.';
  };

  const saveBot = async () => {
    setBotError(null);
    const t = token.trim();
    const g = guildId.trim();
    const c = channelId.trim();
    const v = voiceChannelId.trim();
    if (!t && !state.tokenSet) return setBotError('Enter the bot token.');
    const bad = idError(g, true) || idError(c, true) || idError(v, false);
    if (bad) return setBotError(`Check the IDs. ${bad}`);
    const writes: Array<[(typeof DISCORD_KEYS)[number], string]> = [];
    if (t) writes.push(['discord.bot_token', t]);
    if (g !== (state.guildId ?? '')) writes.push(['discord.guild_id', g]);
    if (c !== (state.channelId ?? '')) writes.push(['discord.channel_id', c]);
    if (v !== (state.voiceChannelId ?? '')) writes.push(['discord.voice_channel_id', v]);
    setSaving(true);
    try {
      for (const [key, value] of writes) await setHouseholdSetting(householdId, key, value);
      if (!state.enabled) await setHouseholdSetting(householdId, 'discord.enabled', true);
      closeEditor();
    } catch (err: unknown) {
      setBotError(settingErrorMessage(err, 'Could not save the Discord bot.'));
    } finally {
      setSaving(false);
      await onChanged();
    }
  };

  const toggleEnabled = async (on: boolean) => {
    setSaving(true);
    setBotError(null);
    try {
      await setHouseholdSetting(householdId, 'discord.enabled', on);
    } catch (err: unknown) {
      setBotError(settingErrorMessage(err, 'Could not change the Discord bot.'));
    } finally {
      setSaving(false);
      await onChanged();
    }
  };

  const removeBot = async () => {
    setSaving(true);
    setBotError(null);
    try {
      await setHouseholdSetting(householdId, 'discord.enabled', false);
      for (const key of DISCORD_KEYS) await setHouseholdSetting(householdId, key, '');
      closeEditor();
    } catch (err: unknown) {
      setBotError(settingErrorMessage(err, 'Could not remove the Discord bot.'));
    } finally {
      setSaving(false);
      await onChanged();
    }
  };

  const confirmRemove = () =>
    Alert.alert(
      'Remove Discord bot',
      'Delete the bot token and turn the Discord bridge off? People will no longer be able to message Jarvis on Discord. Their links stay and work again if you set it up later.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: removeBot },
      ],
    );

  // --- me (every member) ---
  const [status, setStatus] = useState<DiscordStatus | null>(null);
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [pickedNode, setPickedNode] = useState<string | undefined>(undefined);
  const [code, setCode] = useState<DiscordLinkCode | null>(null);
  const [meError, setMeError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await getDiscordStatus(householdId));
    } catch {
      setStatus(null); // an older server: the card hides the "me" part
    }
  }, [householdId]);

  useEffect(() => {
    if (!state.supported) return;
    refreshStatus();
    listNodes(householdId)
      .then(setNodes)
      .catch(() => setNodes([]));
  }, [householdId, state.supported, state.enabled, refreshStatus]);

  const run = async (fn: () => Promise<void>, fallback: string) => {
    setBusy(true);
    setMeError(null);
    try {
      await fn();
    } catch (err: unknown) {
      setMeError(settingErrorMessage(err, fallback));
    } finally {
      setBusy(false);
    }
  };

  const makeCode = () =>
    run(async () => {
      const nodeId = pickedNode ?? (nodes.length === 1 ? nodes[0].node_id : undefined);
      setCode(await createDiscordLinkCode(householdId, nodeId));
    }, 'Could not make a link code.');

  const prefs = (p: Parameters<typeof setDiscordPrefs>[1]) =>
    run(async () => setStatus(await setDiscordPrefs(householdId, p)), 'Could not save that.');

  const unlink = () =>
    run(async () => {
      await unlinkDiscord(householdId);
      setCode(null);
      await refreshStatus();
    }, 'Could not unlink.');

  if (!state.supported && !loading) return null; // a server without the Discord bridge

  const botReady = state.tokenSet && !!state.guildId && !!state.channelId;

  return (
    <Card style={styles.card} testID="discord-card">
      <Card.Content>
        <Text variant="titleMedium" style={styles.sectionTitle}>Discord</Text>
        <Text variant="bodySmall" style={[muted, { marginBottom: 12 }]}>
          Message Jarvis from anywhere, with no VPN, by text or voice clip in Discord. Jarvis answers
          only what you send it, in the place you sent it. The bot token is kept on your Jarvis
          server and is never shown again once saved.
        </Text>

        {loading ? (
          <ActivityIndicator size="small" />
        ) : (
          <>
            <Text variant="titleSmall" style={styles.subTitle}>Bot</Text>
            <Text variant="bodyMedium" testID="discord-bot-status">
              {!botReady
                ? 'Not set up.'
                : state.enabled
                  ? status?.online
                    ? 'On and connected.'
                    : 'On, but not connected yet. Check the token and IDs if this stays.'
                  : 'Set up, but turned off.'}
            </Text>
            {botReady && (
              <View style={styles.statusList}>
                <Text variant="bodySmall" style={muted}>Bot token: set</Text>
                <Text variant="bodySmall" style={muted}>Server ID: {state.guildId}</Text>
                <Text variant="bodySmall" style={muted}>Channel ID: {state.channelId}</Text>
                <Text variant="bodySmall" style={muted}>
                  Voice channel ID: {state.voiceChannelId ?? 'not set (no live voice)'}
                </Text>
              </View>
            )}

            {canEdit && !editing && (
              <View style={[styles.row, { marginTop: 12 }]}>
                <Button testID="discord-edit" mode="contained-tonal" icon="forum" onPress={openEditor} disabled={saving} compact>
                  {botReady ? 'Replace' : 'Set up'}
                </Button>
                {botReady && (
                  <>
                    <Switch
                      testID="discord-enabled"
                      value={state.enabled}
                      onValueChange={toggleEnabled}
                      disabled={saving}
                      style={{ marginLeft: 12 }}
                    />
                    <Button testID="discord-remove" mode="text" textColor={theme.colors.error} onPress={confirmRemove} disabled={saving} compact>
                      Remove
                    </Button>
                  </>
                )}
              </View>
            )}

            {canEdit && editing && (
              <View style={{ marginTop: 12 }}>
                <Button testID="discord-paste" mode="outlined" icon="content-paste" onPress={pasteDetails} compact style={{ marginBottom: 8 }}>
                  Paste details from clipboard
                </Button>
                <TextInput
                  testID="discord-token-input"
                  mode="outlined"
                  dense
                  label="Bot token"
                  value={token}
                  onChangeText={setToken}
                  placeholder={state.tokenSet ? 'Leave blank to keep the current one' : undefined}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                />
                <TextInput testID="discord-guild-input" mode="outlined" dense label="Server ID" value={guildId}
                  onChangeText={setGuildId} keyboardType="number-pad" autoCorrect={false} style={styles.input} />
                <TextInput testID="discord-channel-input" mode="outlined" dense label="Text channel ID" value={channelId}
                  onChangeText={setChannelId} keyboardType="number-pad" autoCorrect={false} style={styles.input} />
                <TextInput testID="discord-voice-input" mode="outlined" dense label="Voice channel ID (optional)" value={voiceChannelId}
                  onChangeText={setVoiceChannelId} keyboardType="number-pad" autoCorrect={false} style={styles.input} />
                <HelperText type="info" visible>
                  In Discord turn on Developer Mode (Settings, Advanced), then right-click the server and channels, Copy ID.
                </HelperText>
                {botError && <HelperText type="error" visible testID="discord-bot-error">{botError}</HelperText>}
                <View style={[styles.row, { justifyContent: 'flex-end' }]}>
                  <Button testID="discord-cancel" onPress={closeEditor} disabled={saving} compact>Cancel</Button>
                  <Button testID="discord-save" mode="contained-tonal" onPress={saveBot} loading={saving} disabled={saving} style={{ marginLeft: 8 }} compact>
                    Save
                  </Button>
                </View>
              </View>
            )}
            {!editing && botError && <HelperText type="error" visible testID="discord-bot-error">{botError}</HelperText>}
            {!canEdit && <Text variant="bodySmall" style={[muted, { marginTop: 8 }]}>Only a household admin can change the bot.</Text>}

            {status && state.enabled && (
              <View style={{ marginTop: 20 }}>
                <Text variant="titleSmall" style={styles.subTitle}>My Discord</Text>
                {status.linked ? (
                  <>
                    <Text variant="bodyMedium" testID="discord-linked">Linked. Message the bot, or use /jarvis in Discord.</Text>
                    <View style={[styles.toggleRow, { marginTop: 12 }]}>
                      <View style={{ flex: 1, paddingRight: 12 }}>
                        <Text variant="bodyMedium">Send me reminders and alarms</Text>
                        <Text variant="bodySmall" style={muted}>
                          Jarvis messages you in Discord, only for reminders and alarms you set. Off by default.
                        </Text>
                      </View>
                      <Switch testID="discord-proactive" value={!!status.proactive} onValueChange={(v) => prefs({ proactive: v })} disabled={busy} />
                    </View>
                    <Text variant="bodyMedium" style={{ marginTop: 12, marginBottom: 6 }}>Voice replies</Text>
                    <SegmentedButtons
                      value={status.voice_replies ?? 'auto'}
                      onValueChange={(v) => prefs({ voice_replies: v as VoiceReplies })}
                      buttons={[
                        { value: 'auto', label: 'Auto', testID: 'discord-voice-auto' },
                        { value: 'always', label: 'Always', testID: 'discord-voice-always' },
                        { value: 'never', label: 'Never', testID: 'discord-voice-never' },
                      ]}
                    />
                    <Text variant="bodySmall" style={[muted, { marginTop: 4 }]}>
                      Auto answers a voice clip with a voice clip, and typing with text.
                    </Text>
                    <Button testID="discord-unlink" mode="text" textColor={theme.colors.error} onPress={unlink} disabled={busy} compact style={{ alignSelf: 'flex-start', marginTop: 8 }}>
                      Unlink my Discord
                    </Button>
                  </>
                ) : code ? (
                  <View testID="discord-code-box">
                    <Text variant="bodyMedium">In Discord, send the bot this command, with your code:</Text>
                    <Text variant="headlineSmall" selectable testID="discord-code" style={styles.code}>{code.code}</Text>
                    <Text variant="bodySmall" style={muted}>
                      /jarvis link code:{code.code}. It works once and expires in {Math.round(code.expires_in / 60)} minutes.
                    </Text>
                    <View style={[styles.row, { marginTop: 8 }]}>
                      <Button testID="discord-check" mode="contained-tonal" onPress={refreshStatus} compact>I sent it</Button>
                      <Button testID="discord-newcode" mode="text" onPress={makeCode} disabled={busy} compact>New code</Button>
                    </View>
                  </View>
                ) : (
                  <>
                    <Text variant="bodyMedium">Not linked. Link your Discord account to talk to Jarvis there.</Text>
                    {nodes.length > 1 && (
                      <View style={{ marginTop: 8 }}>
                        <Text variant="bodySmall" style={muted}>Answer through:</Text>
                        <View style={styles.chips}>
                          {nodes.map((n) => (
                            <Chip key={n.node_id} testID={`discord-node-${n.node_id}`} selected={pickedNode === n.node_id}
                              onPress={() => setPickedNode(n.node_id)} style={{ marginRight: 6, marginTop: 6 }}>
                              {nodeLabel(n)}
                            </Chip>
                          ))}
                        </View>
                      </View>
                    )}
                    <Button testID="discord-link" mode="contained-tonal" icon="link" onPress={makeCode}
                      disabled={busy || (nodes.length > 1 && !pickedNode)} loading={busy} compact style={{ alignSelf: 'flex-start', marginTop: 12 }}>
                      Link my Discord
                    </Button>
                  </>
                )}
                {meError && <HelperText type="error" visible testID="discord-me-error">{meError}</HelperText>}
              </View>
            )}
          </>
        )}
      </Card.Content>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: { marginBottom: 16 },
  sectionTitle: { fontWeight: '600', marginBottom: 12 },
  subTitle: { fontWeight: '600', marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center' },
  toggleRow: { flexDirection: 'row', alignItems: 'center' },
  statusList: { marginTop: 6, gap: 2 },
  input: { marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  code: { fontFamily: 'monospace', letterSpacing: 4, marginVertical: 8 },
});

export default DiscordSettingsCard;
