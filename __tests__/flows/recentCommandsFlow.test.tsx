import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import RecentCommandsListScreen from '../../src/screens/RecentCommands/RecentCommandsListScreen';
import { lightTheme } from '../../src/theme';
import { listRecentTranscripts, rateTranscript } from '../../src/api/transcriptsApi';

// L1 FLOW INTEGRATION — the recent-commands history list (no prior coverage):
// load on focus + row render (message + tool-call summary), tap-to-detail nav,
// the thumbs up/down optimistic rating with same-rating toggle-off, the rate
// failure banner, and the empty + load-error states. Real screen + real
// list/rating state; only api/auth/nav/help leaves are mocked.

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const ReactLocal = require('react');
  return {
    useNavigation: () => ({ navigate: mockNavigate }),
    useFocusEffect: (cb: any) => ReactLocal.useEffect(() => cb(), []),
  };
});

jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({ state: { accessToken: 'tok' } }),
}));

// InfoHelperText is a context-backed help leaf — stub it.
jest.mock('../../src/components/HelpIcon', () => ({ InfoHelperText: () => null }));

jest.mock('../../src/api/transcriptsApi', () => ({
  listRecentTranscripts: jest.fn(),
  rateTranscript: jest.fn(),
}));

const T1 = {
  id: 1,
  created_at: new Date().toISOString(),
  user_message: 'Turn on the kitchen lights',
  tool_calls: [{ name: 'control_device', arguments: { device: 'kitchen', action: 'on' } }],
  user_rating: 0,
};
const T2 = {
  id: 2,
  created_at: new Date().toISOString(),
  user_message: 'What is the weather',
  tool_calls: [{ name: 'get_weather', arguments: {} }],
  user_rating: 0,
};

const renderScreen = () =>
  render(
    <PaperProvider theme={lightTheme}>
      <RecentCommandsListScreen />
    </PaperProvider>,
  );

describe('Recent commands — flow integration (load, nav, rating toggle, errors)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (listRecentTranscripts as jest.Mock).mockResolvedValue([T1, T2]);
    // Echo the requested rating back so the screen's optimistic replace updates state.
    (rateTranscript as jest.Mock).mockImplementation((id: number, rating: number) =>
      Promise.resolve({ ...T1, id, user_rating: rating }),
    );
  });

  it('loads on focus and renders the command rows (message + tool summary)', async () => {
    const utils = renderScreen();
    await utils.findByText('“Turn on the kitchen lights”');

    expect(listRecentTranscripts).toHaveBeenCalledWith({ limit: 50 });
    expect(utils.getByText(/control_device\(device=kitchen/)).toBeTruthy();
    expect(utils.getByText('“What is the weather”')).toBeTruthy();
  });

  it('tapping a command navigates to its detail with the transcript id', async () => {
    const utils = renderScreen();
    await utils.findByText('“Turn on the kitchen lights”');

    fireEvent.press(utils.getByTestId('recent-card-1'));

    expect(mockNavigate).toHaveBeenCalledWith('RecentCommandDetail', { transcriptId: 1 });
  });

  it('thumbs-up rates the command, then re-tapping the same rating toggles it off', async () => {
    const utils = renderScreen();
    await utils.findByText('“Turn on the kitchen lights”');

    // First tap: rate +1 (optimistic replace sets user_rating=1 on the row).
    await act(async () => {
      fireEvent.press(utils.getByTestId('recent-up-1'));
    });
    expect(rateTranscript).toHaveBeenNthCalledWith(1, 1, 1);

    // Second tap on the now-active up: toggles to 0.
    await act(async () => {
      fireEvent.press(utils.getByTestId('recent-up-1'));
    });
    expect(rateTranscript).toHaveBeenNthCalledWith(2, 1, 0);
  });

  it('thumbs-down rates the command -1', async () => {
    const utils = renderScreen();
    await utils.findByText('“Turn on the kitchen lights”');

    await act(async () => {
      fireEvent.press(utils.getByTestId('recent-down-1'));
    });

    expect(rateTranscript).toHaveBeenCalledWith(1, -1);
  });

  it('shows a banner when rating fails', async () => {
    (rateTranscript as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    const utils = renderScreen();
    await utils.findByText('“Turn on the kitchen lights”');

    await act(async () => {
      fireEvent.press(utils.getByTestId('recent-up-1'));
    });

    await utils.findByText('Rating failed — try again');
  });

  it('renders the empty state when there is no history', async () => {
    (listRecentTranscripts as jest.Mock).mockResolvedValue([]);
    const utils = renderScreen();
    await utils.findByText(/No recent commands yet/);
  });

  it('shows an error banner when the load fails', async () => {
    (listRecentTranscripts as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    const utils = renderScreen();
    await utils.findByText('Could not load recent commands');
  });
});
