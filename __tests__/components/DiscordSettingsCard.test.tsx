import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';

import DiscordSettingsCard, {
  discordStateFromSettings,
  type DiscordBotState,
} from '../../src/components/DiscordSettingsCard';
import {
  createDiscordLinkCode,
  getDiscordStatus,
  setDiscordPrefs,
  unlinkDiscord,
} from '../../src/api/discordApi';
import { listNodes } from '../../src/api/nodeApi';
import { setHouseholdSetting } from '../../src/api/householdSettingsApi';
import { PaperWrapper } from '../testUtils';

jest.mock('expo-clipboard', () => ({ getStringAsync: jest.fn() }));
jest.mock('../../src/api/discordApi');
jest.mock('../../src/api/nodeApi', () => ({ listNodes: jest.fn() }));
jest.mock('../../src/api/householdSettingsApi', () => {
  const actual = jest.requireActual('../../src/api/householdSettingsApi');
  return { ...actual, setHouseholdSetting: jest.fn(() => Promise.resolve()) };
});

const setSetting = setHouseholdSetting as jest.Mock;
const status = getDiscordStatus as jest.Mock;
const makeCode = createDiscordLinkCode as jest.Mock;
const prefs = setDiscordPrefs as jest.Mock;
const unlink = unlinkDiscord as jest.Mock;
const nodes = listNodes as jest.Mock;
const clipboard = Clipboard.getStringAsync as jest.Mock;

const TOKEN = 'MTAwMDAwMDAwMDAwMDAwMDA0.GabcDe.abcdefghijklmnopqrstuvwxyz0123456789ABCD';
const OFF: DiscordBotState = { supported: true, enabled: false, tokenSet: false, guildId: null, channelId: null, voiceChannelId: null };
const ON: DiscordBotState = {
  supported: true, enabled: true, tokenSet: true,
  guildId: '100000000000000001', channelId: '100000000000000002', voiceChannelId: null,
};

const renderCard = (state: DiscordBotState, canEdit = true) => {
  const onChanged = jest.fn(() => Promise.resolve());
  const utils = render(
    <PaperWrapper>
      <DiscordSettingsCard householdId="hh-1" state={state} loading={false} canEdit={canEdit} onChanged={onChanged} />
    </PaperWrapper>,
  );
  return { ...utils, onChanged };
};

beforeEach(() => {
  jest.clearAllMocks();
  setSetting.mockResolvedValue(undefined);
  status.mockResolvedValue({ enabled: true, online: true, linked: false });
  nodes.mockResolvedValue([{ node_id: 'n1', room: 'Kitchen', name: null }]);
});

describe('discordStateFromSettings', () => {
  it('shows whether the token is set and never keeps it', () => {
    expect(
      discordStateFromSettings({
        'discord.enabled': true, 'discord.bot_token': '********',
        'discord.guild_id': '100000000000000001', 'discord.channel_id': '100000000000000002',
      }),
    ).toEqual({ ...ON, voiceChannelId: null });
  });
  it('knows a server without the bridge', () => {
    expect(discordStateFromSettings({}).supported).toBe(false);
  });
});

describe('DiscordSettingsCard: the bot', () => {
  it('renders nothing on a server without the bridge', () => {
    const { queryByTestId } = renderCard({ ...OFF, supported: false });
    expect(queryByTestId('discord-card')).toBeNull();
  });

  it('pastes the details, saves each changed setting, and turns the bridge on', async () => {
    clipboard.mockResolvedValue(
      `Bot Token: ${TOKEN}\nServer ID: 100000000000000001\nChannel ID: 100000000000000002\nVoice Channel ID: 100000000000000003`,
    );
    const { getByTestId, onChanged } = renderCard(OFF);
    fireEvent.press(getByTestId('discord-edit'));
    await act(async () => { fireEvent.press(getByTestId('discord-paste')); });
    await act(async () => { fireEvent.press(getByTestId('discord-save')); });

    expect(setSetting.mock.calls).toEqual([
      ['hh-1', 'discord.bot_token', TOKEN],
      ['hh-1', 'discord.guild_id', '100000000000000001'],
      ['hh-1', 'discord.channel_id', '100000000000000002'],
      ['hh-1', 'discord.voice_channel_id', '100000000000000003'],
      ['hh-1', 'discord.enabled', true],
    ]);
    expect(onChanged).toHaveBeenCalled();
  });

  it('refuses a channel name where an ID is needed, and writes nothing', async () => {
    const { getByTestId, findByTestId } = renderCard(OFF);
    fireEvent.press(getByTestId('discord-edit'));
    fireEvent.changeText(getByTestId('discord-token-input'), TOKEN);
    fireEvent.changeText(getByTestId('discord-guild-input'), '100000000000000001');
    fireEvent.changeText(getByTestId('discord-channel-input'), '#jarvis');
    await act(async () => { fireEvent.press(getByTestId('discord-save')); });
    expect((await findByTestId('discord-bot-error')).props.children).toMatch(/Check the IDs/);
    expect(setSetting).not.toHaveBeenCalled();
  });

  it('keeps the current token when only an ID changes', async () => {
    const { getByTestId } = renderCard(ON);
    fireEvent.press(getByTestId('discord-edit'));
    fireEvent.changeText(getByTestId('discord-voice-input'), '100000000000000003');
    await act(async () => { fireEvent.press(getByTestId('discord-save')); });
    expect(setSetting.mock.calls).toEqual([['hh-1', 'discord.voice_channel_id', '100000000000000003']]);
  });

  it('shows the server error when a save is refused', async () => {
    setSetting.mockRejectedValueOnce({ response: { data: { detail: 'Invalid value for discord.guild_id: expected a Discord ID' } } });
    const { getByTestId, findByTestId } = renderCard(ON);
    fireEvent.press(getByTestId('discord-edit'));
    fireEvent.changeText(getByTestId('discord-guild-input'), '1481128313983602999');
    await act(async () => { fireEvent.press(getByTestId('discord-save')); });
    expect((await findByTestId('discord-bot-error')).props.children).toMatch(/expected a Discord ID/);
  });

  it('only an admin sees the editor', () => {
    const { queryByTestId, getByText } = renderCard(ON, false);
    expect(queryByTestId('discord-edit')).toBeNull();
    expect(getByText(/Only a household admin/)).toBeTruthy();
  });

  it('removing clears the token and IDs after confirmation', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const { getByTestId } = renderCard(ON);
    fireEvent.press(getByTestId('discord-remove'));
    const remove = (alert.mock.calls[0][2] as Array<{ text: string; onPress?: () => void }>).find((b) => b.text === 'Remove')!;
    await act(async () => { remove.onPress!(); });
    expect(setSetting.mock.calls.map((c) => c[1])).toEqual([
      'discord.enabled', 'discord.bot_token', 'discord.guild_id', 'discord.channel_id', 'discord.voice_channel_id',
    ]);
    expect(setSetting.mock.calls[0][2]).toBe(false);
    alert.mockRestore();
  });
});

describe('DiscordSettingsCard: my Discord', () => {
  it('hides the personal part until the bridge is on', () => {
    const { queryByText } = renderCard({ ...ON, enabled: false });
    expect(queryByText('My Discord')).toBeNull();
  });

  it('links with a code (one node: no picker, that node is used)', async () => {
    makeCode.mockResolvedValue({ code: 'K7M2QXP9', expires_in: 600 });
    const { findByTestId, getByTestId, queryByTestId } = renderCard(ON);
    const link = await findByTestId('discord-link');
    expect(queryByTestId('discord-node-n1')).toBeNull();
    await act(async () => { fireEvent.press(link); });
    expect(makeCode).toHaveBeenCalledWith('hh-1', 'n1');
    expect(getByTestId('discord-code').props.children).toBe('K7M2QXP9');

    // After "I sent it" the status shows the link.
    status.mockResolvedValue({ enabled: true, online: true, linked: true, voice_replies: 'auto', proactive: false });
    await act(async () => { fireEvent.press(getByTestId('discord-check')); });
    expect(await findByTestId('discord-linked')).toBeTruthy();
  });

  it('makes the person pick a node when there are several', async () => {
    nodes.mockResolvedValue([
      { node_id: 'n1', room: 'Kitchen', name: null },
      { node_id: 'n2', room: 'Office', name: null },
    ]);
    makeCode.mockResolvedValue({ code: 'K7M2QXP9', expires_in: 600 });
    const { findByTestId, getByTestId } = renderCard(ON);
    const link = await findByTestId('discord-link');
    await waitFor(() => expect(getByTestId('discord-node-n2')).toBeTruthy());
    expect(link.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(getByTestId('discord-node-n2'));
    await act(async () => { fireEvent.press(getByTestId('discord-link')); });
    expect(makeCode).toHaveBeenCalledWith('hh-1', 'n2');
  });

  it('says why a code could not be made', async () => {
    makeCode.mockRejectedValue({ response: { data: { detail: 'The Discord bot is not running for this household.' } } });
    const { findByTestId, getByTestId } = renderCard(ON);
    const link = await findByTestId('discord-link');
    await act(async () => { fireEvent.press(link); });
    expect(getByTestId('discord-me-error').props.children).toMatch(/not running/);
  });

  it('changes reminders and voice replies, and unlinks', async () => {
    status.mockResolvedValue({ enabled: true, online: true, linked: true, voice_replies: 'auto', proactive: false });
    prefs.mockResolvedValue({ enabled: true, online: true, linked: true, voice_replies: 'never', proactive: true });
    unlink.mockResolvedValue(undefined);
    const { findByTestId, getByTestId } = renderCard(ON);
    const proactive = await findByTestId('discord-proactive');
    expect(proactive.props.value).toBe(false); // reminders are opt in
    await act(async () => { fireEvent(proactive, 'valueChange', true); });
    expect(prefs).toHaveBeenCalledWith('hh-1', { proactive: true });
    await act(async () => { fireEvent.press(getByTestId('discord-voice-never')); });
    expect(prefs).toHaveBeenCalledWith('hh-1', { voice_replies: 'never' });
    status.mockResolvedValue({ enabled: true, online: true, linked: false });
    await act(async () => { fireEvent.press(getByTestId('discord-unlink')); });
    expect(unlink).toHaveBeenCalledWith('hh-1');
  });
});
