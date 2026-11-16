import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

import ChannelsCard, { channelLabel } from '../../src/components/ChannelsCard';
import {
  createChannelLinkCode,
  listChannels,
  setChannelPrefs,
  unlinkChannel,
} from '../../src/api/channelsApi';
import { listNodes } from '../../src/api/nodeApi';
import { PaperWrapper } from '../testUtils';

// Chat channels (jarvisd docs/CHANNELS.md): the card lists whatever the server says the
// household has and names no service itself. A member links with a one-time code, turns
// reminders on (off by default) or unlinks.

jest.mock('../../src/api/channelsApi', () => ({
  listChannels: jest.fn(),
  createChannelLinkCode: jest.fn(),
  setChannelPrefs: jest.fn(),
  unlinkChannel: jest.fn(),
}));
jest.mock('../../src/api/nodeApi', () => ({ listNodes: jest.fn() }));

const list = listChannels as jest.Mock;
const makeCode = createChannelLinkCode as jest.Mock;
const setPrefs = setChannelPrefs as jest.Mock;
const unlink = unlinkChannel as jest.Mock;
const nodes = listNodes as jest.Mock;

const NODE = (id: string) => ({ node_id: id, room: id });

const renderCard = async () => {
  const utils = render(
    <PaperWrapper>
      <ChannelsCard householdId="hh-1" />
    </PaperWrapper>,
  );
  await act(async () => {});
  return utils;
};

beforeEach(() => {
  jest.clearAllMocks();
  nodes.mockResolvedValue([NODE('kitchen')]);
  makeCode.mockResolvedValue({ code: 'ABCD2345', expires_in: 600 });
  setPrefs.mockResolvedValue({});
  unlink.mockResolvedValue(undefined);
});

describe('ChannelsCard', () => {
  it('names a channel from its provider', () => {
    expect(channelLabel('discord')).toBe('Discord');
    expect(channelLabel('my_chat')).toBe('My chat');
  });

  it('shows nothing when the household has no channel or the server has none', async () => {
    list.mockResolvedValue([]);
    expect((await renderCard()).queryByTestId('channels-card')).toBeNull();
    list.mockRejectedValue(new Error('404'));
    expect((await renderCard()).queryByTestId('channels-card')).toBeNull();
  });

  it('links with a one-time code and re-reads when the code was sent', async () => {
    list.mockResolvedValue([{ provider: 'discord', online: true, linked: false }]);
    const { getByTestId, queryByTestId } = await renderCard();
    await act(async () => fireEvent.press(getByTestId('channel-discord-link')));
    expect(makeCode).toHaveBeenCalledWith('hh-1', 'discord', 'kitchen');
    expect(getByTestId('channel-discord-code').props.children).toBe('ABCD2345');

    list.mockResolvedValue([{ provider: 'discord', online: true, linked: true, proactive: false }]);
    await act(async () => fireEvent.press(getByTestId('channel-discord-check')));
    expect(getByTestId('channel-discord-linked')).toBeTruthy();
    expect(queryByTestId('channel-discord-code')).toBeNull();
  });

  it('asks which node answers when the household has several', async () => {
    nodes.mockResolvedValue([NODE('kitchen'), NODE('office')]);
    list.mockResolvedValue([{ provider: 'slack', online: true, linked: false }]);
    const { getByTestId } = await renderCard();
    await act(async () => fireEvent.press(getByTestId('channel-slack-link')));
    expect(makeCode).not.toHaveBeenCalled(); // disabled until a node is picked
    fireEvent.press(getByTestId('channel-slack-node-office'));
    await act(async () => fireEvent.press(getByTestId('channel-slack-link')));
    expect(makeCode).toHaveBeenCalledWith('hh-1', 'slack', 'office');
  });

  it('does not offer a link while the channel is not running', async () => {
    list.mockResolvedValue([{ provider: 'discord', online: false, linked: false }]);
    const { queryByTestId, getByTestId } = await renderCard();
    expect(getByTestId('channel-discord-status').props.children).toBe('Not running');
    expect(queryByTestId('channel-discord-link')).toBeNull();
  });

  it('turns reminders on and unlinks, each channel on its own', async () => {
    list.mockResolvedValue([
      { provider: 'discord', online: true, linked: true, proactive: false },
      { provider: 'slack', online: true, linked: true, proactive: true },
    ]);
    const { getByTestId } = await renderCard();
    expect(getByTestId('channel-slack-proactive').props.value).toBe(true);
    await act(async () => fireEvent(getByTestId('channel-discord-proactive'), 'valueChange', true));
    expect(setPrefs).toHaveBeenCalledWith('hh-1', 'discord', { proactive: true });
    await act(async () => fireEvent.press(getByTestId('channel-slack-unlink')));
    expect(unlink).toHaveBeenCalledWith('hh-1', 'slack');
  });

  it('says why when the server refuses', async () => {
    list.mockResolvedValue([{ provider: 'discord', online: true, linked: false }]);
    makeCode.mockRejectedValue({ response: { data: { detail: 'That channel is not running for this household.' } } });
    const { getByTestId } = await renderCard();
    await act(async () => fireEvent.press(getByTestId('channel-discord-link')));
    expect(getByTestId('channel-discord-error').props.children).toBe('That channel is not running for this household.');
  });
});
