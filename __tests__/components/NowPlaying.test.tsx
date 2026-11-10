import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { controlPlayback, getPlayback, NodePlayback, positionAt } from '../../src/api/playbackApi';
import MiniPlayer from '../../src/components/NowPlaying/MiniPlayer';
import NowPlayingCard from '../../src/components/NowPlaying/NowPlayingCard';
import { PaperWrapper } from '../testUtils';

jest.mock('../../src/api/playbackApi', () => ({
  ...jest.requireActual('../../src/api/playbackApi'),
  getPlayback: jest.fn(),
  controlPlayback: jest.fn(),
}));
jest.mock('../../src/config/serviceConfig', () => ({ getCommandCenterUrl: () => 'http://jarvisd.test' }));
jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({ state: { activeHouseholdId: 'hh1', accessToken: 'tok' } }),
}));
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));
jest.mock('@react-native-community/slider', () => {
  const { View } = jest.requireActual('react-native');
  return (props: object) => <View {...props} />;
});

const mockGet = getPlayback as jest.Mock;
const mockControl = controlPlayback as jest.Mock;

const entry = (over: Partial<NodePlayback['state']> = {}, top: Partial<NodePlayback> = {}): NodePlayback => ({
  node_id: 'kitchen', node_name: 'Kitchen', source: 'pkg:spotify', name: 'Spotify',
  updated_at: '2026-11-07T12:00:00Z', cover: 'abc',
  state: {
    state: 'playing', media_title: 'Song', media_artist: 'Artist', media_album: 'Album', context: '',
    actions: ['play', 'pause', 'next', 'previous', 'seek', 'volume', 'shuffle', 'repeat'],
    position: 30, duration: 200, volume: 40, shuffle: false, repeat: 'all', ...over,
  },
  ...top,
});

const clients: QueryClient[] = [];
afterEach(() => clients.splice(0).forEach((c) => c.clear())); // stop the poll timers

const withQuery = (ui: React.ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <PaperWrapper>{ui}</PaperWrapper>
    </QueryClientProvider>,
  );
};

describe('NowPlayingCard', () => {
  it('shows only the controls the source supports', () => {
    const send = jest.fn();
    render(<PaperWrapper><NowPlayingCard p={entry({ actions: ['pause'], shuffle: undefined, repeat: undefined, volume: undefined })} send={send} /></PaperWrapper>);
    expect(screen.getByLabelText('Pause')).toBeTruthy();
    for (const label of ['Next track', 'Previous track', 'Shuffle', 'Repeat all', 'Volume']) {
      expect(screen.queryByLabelText(label)).toBeNull();
    }
    fireEvent.press(screen.getByLabelText('Pause'));
    expect(send).toHaveBeenCalledWith({ node_id: 'kitchen', action: 'pause' });
  });

  it('sends seek and volume once, on release, and marks toggles as selected', () => {
    const send = jest.fn();
    render(<PaperWrapper><NowPlayingCard p={entry()} send={send} /></PaperWrapper>);
    fireEvent(screen.getByTestId('np-seek'), 'slidingComplete', 90.5);
    fireEvent(screen.getByTestId('np-volume'), 'slidingComplete', 64.6);
    expect(send).toHaveBeenNthCalledWith(1, { node_id: 'kitchen', action: 'seek', position: 90.5 });
    expect(send).toHaveBeenNthCalledWith(2, { node_id: 'kitchen', action: 'volume', volume: 65 });
    expect(screen.getByLabelText('Repeat all').props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByLabelText('Shuffle').props.accessibilityState).toMatchObject({ selected: false });
  });

  it('loads the cover from jarvisd with the token', () => {
    render(<PaperWrapper><NowPlayingCard p={entry()} send={jest.fn()} /></PaperWrapper>);
    expect(screen.getByTestId('np-cover').props.source).toEqual({
      uri: 'http://jarvisd.test/api/v0/mobile/playback/cover?node_id=kitchen&v=abc',
      headers: { Authorization: 'Bearer tok' },
    });
  });

  it('shows no image without a cover', () => {
    render(<PaperWrapper><NowPlayingCard p={entry({}, { cover: undefined })} send={jest.fn()} /></PaperWrapper>);
    expect(screen.queryByTestId('np-cover')).toBeNull();
  });
});

describe('positionAt', () => {
  const at = Date.parse('2026-11-07T12:00:10Z');
  it('advances while playing, capped at the duration', () => {
    expect(positionAt(entry(), at)).toBe(40);
    expect(positionAt(entry({ position: 195 }), at)).toBe(200);
  });
  it('holds while paused', () => {
    expect(positionAt(entry({ state: 'paused' }), at)).toBe(30);
  });
});

describe('MiniPlayer', () => {
  beforeEach(() => jest.clearAllMocks());

  it('is hidden while nothing plays', async () => {
    mockGet.mockResolvedValue([]);
    withQuery(<MiniPlayer />);
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('hh1'));
    expect(screen.queryByTestId('mini-player')).toBeNull();
  });

  it('shows the playing node, counts the others, and pauses it', async () => {
    mockGet.mockResolvedValue([
      entry({ state: 'paused', media_title: 'Paused one' }, { node_id: 'office', node_name: 'Office' }),
      entry(),
    ]);
    // The playing node is shown even when a paused one comes first.
    mockControl.mockResolvedValue(entry({ state: 'paused' }));
    withQuery(<MiniPlayer />);
    expect(await screen.findByText('Song')).toBeTruthy();
    expect(screen.getByText('Artist · Kitchen · +1 more')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Pause'));
    await waitFor(() => expect(mockControl).toHaveBeenCalledWith({ node_id: 'kitchen', action: 'pause' }));
    // The read-back replaces the kitchen's entry; with nothing playing, the first node shows.
    expect(await screen.findByText('Paused one')).toBeTruthy();
    expect(screen.getByLabelText('Play')).toBeTruthy();
    fireEvent.press(screen.getByTestId('mini-player'));
    expect(mockNavigate).toHaveBeenCalledWith('NowPlaying');
  });
});
