import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import AdapterProposalDetailScreen from '../../src/screens/Inbox/AdapterProposalDetailScreen';
import { lightTheme } from '../../src/theme';
import { getProposal, applyProposal } from '../../src/api/adaptersApi';

// L1 FLOW INTEGRATION — the proposal per-command detail/preview screen (no prior
// coverage): load via getProposal, the Improvements/Regressions/No-change
// breakdown bucketing + sort, the summary row, Apply (applyProposal -> "Applied"
// -> popToTop), the non-pending gate that hides Apply, the empty-breakdown
// message, and the load-error + Retry path. Real screen + real load/apply state;
// only api/auth/nav are mocked.

const mockPopToTop = jest.fn();
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ popToTop: mockPopToTop, goBack: mockGoBack, navigate: jest.fn() }),
  useRoute: () => ({ params: { proposalId: 'prop-3' } }),
}));

jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({ state: { accessToken: 'tok' } }),
}));

jest.mock('../../src/api/adaptersApi', () => ({
  getProposal: jest.fn(),
  applyProposal: jest.fn(),
}));

const PROPOSAL = {
  id: 'prop-3',
  status: 'pending',
  adapter_hash: 'abcdef0123456789',
  pass_rate_before: 80,
  pass_rate_after: 90,
  per_command_delta: {
    set_timer: { delta_pp: 10, before: { passed: 8, total: 10 }, after: { passed: 10, total: 10 } },
    play_music: { delta_pp: -5, before: { passed: 10, total: 10 }, after: { passed: 9, total: 10 } },
    get_weather: { delta_pp: 0, before: { passed: 5, total: 5 }, after: { passed: 5, total: 5 } },
  },
} as any;

const renderScreen = () =>
  render(
    <PaperProvider theme={lightTheme}>
      <AdapterProposalDetailScreen />
    </PaperProvider>,
  );

describe('Adapter proposal detail — flow integration (breakdown, apply, gate, empty, retry)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getProposal as jest.Mock).mockResolvedValue(PROPOSAL);
    (applyProposal as jest.Mock).mockResolvedValue(undefined);
  });

  it('loads and buckets the per-command deltas into the right sections', async () => {
    const utils = renderScreen();
    await utils.findByText('Per-command breakdown');

    expect(getProposal).toHaveBeenCalledWith('prop-3');
    expect(utils.getByText('Improvements')).toBeTruthy();
    expect(utils.getByText('Regressions')).toBeTruthy();
    expect(utils.getByText('No change')).toBeTruthy();
    expect(utils.getByText('set_timer')).toBeTruthy(); // win
    expect(utils.getByText('play_music')).toBeTruthy(); // loss
    // summary row before/after
    expect(utils.getByText('80.0%')).toBeTruthy();
    expect(utils.getByText('90.0%')).toBeTruthy();
  });

  it('Apply → applyProposal → "Applied" → popToTop', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const utils = renderScreen();
    await utils.findByTestId('adapter-detail-apply');

    await act(async () => {
      fireEvent.press(utils.getByTestId('adapter-detail-apply'));
    });

    expect(applyProposal).toHaveBeenCalledWith('prop-3');
    expect(alertSpy).toHaveBeenCalledWith('Applied', expect.stringContaining('updated'));
    expect(mockPopToTop).toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('a non-pending proposal hides the Apply button', async () => {
    (getProposal as jest.Mock).mockResolvedValue({ ...PROPOSAL, status: 'applied' });
    const utils = renderScreen();
    await utils.findByText('Per-command breakdown');

    expect(utils.queryByTestId('adapter-detail-apply')).toBeNull();
  });

  it('shows the empty message when there is no per-command data', async () => {
    (getProposal as jest.Mock).mockResolvedValue({ ...PROPOSAL, per_command_delta: {} });
    const utils = renderScreen();
    await utils.findByText('No per-command data available for this proposal.');
  });

  it('load error → error text + Retry that re-loads', async () => {
    (getProposal as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    const utils = renderScreen();
    await utils.findByText('Could not load proposal');

    fireEvent.press(utils.getByTestId('adapter-detail-retry'));
    await utils.findByText('Per-command breakdown');
  });
});
