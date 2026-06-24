import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import AdapterProposalScreen from '../../src/screens/Inbox/AdapterProposalScreen';
import { lightTheme } from '../../src/theme';
import { getInboxItem } from '../../src/api/inboxApi';
import { getProposal, applyProposal, dismissProposal } from '../../src/api/adaptersApi';

// L1 FLOW INTEGRATION — the adapter-proposal landing screen (no prior coverage):
// the two-hop load (getInboxItem -> proposal_id -> getProposal), the headline
// metrics render, Apply (applyProposal -> "Applied" alert -> goBack), Dismiss
// (confirm -> dismissProposal -> goBack), Preview navigation, the already-decided
// (non-pending) state that hides the actions, and the load-error + Retry path.
// Real screen + real load/acting state; only api/auth/nav/help leaves mocked.

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
  useRoute: () => ({ params: { itemId: 'inbox-1' } }),
}));

jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({ state: { accessToken: 'tok' } }),
}));

// Help affordances are context-backed leaves — stub them out.
jest.mock('../../src/components/HelpIcon', () => ({
  HelpIcon: () => null,
  InfoHelperText: () => null,
}));

jest.mock('../../src/api/inboxApi', () => ({ getInboxItem: jest.fn() }));
jest.mock('../../src/api/adaptersApi', () => ({
  getProposal: jest.fn(),
  applyProposal: jest.fn(),
  dismissProposal: jest.fn(),
}));

const INBOX_ITEM = {
  id: 'inbox-1',
  title: 'New skill: kitchen timers',
  metadata: { proposal_id: 'prop-9' },
} as any;

const PROPOSAL = {
  id: 'prop-9',
  status: 'pending',
  trained_on_examples: 240,
  expires_at: '2999-01-01T00:00:00Z',
  pass_rate_before: 85,
  pass_rate_after: 92,
  latency_before_s: 1.2,
  latency_after_s: 0.9,
} as any;

const renderScreen = () =>
  render(
    <PaperProvider theme={lightTheme}>
      <AdapterProposalScreen />
    </PaperProvider>,
  );

describe('Adapter proposal — flow integration (load, apply, dismiss, preview, decided, retry)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getInboxItem as jest.Mock).mockResolvedValue(INBOX_ITEM);
    (getProposal as jest.Mock).mockResolvedValue(PROPOSAL);
    (applyProposal as jest.Mock).mockResolvedValue(undefined);
    (dismissProposal as jest.Mock).mockResolvedValue(undefined);
  });

  it('loads via inbox item → proposal, then renders headline metrics + actions', async () => {
    const utils = renderScreen();
    await utils.findByText('New skill: kitchen timers');

    expect(getInboxItem).toHaveBeenCalledWith('inbox-1');
    expect(getProposal).toHaveBeenCalledWith('prop-9');
    // Accuracy metric: 92.0% (+7.0pp from 85.0%)
    expect(utils.getByText('92.0%')).toBeTruthy();
    expect(utils.getByText('+7.0pp')).toBeTruthy();
    expect(utils.getByTestId('adapter-apply')).toBeTruthy();
  });

  it('Apply → applyProposal → "Applied" alert → goBack', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const utils = renderScreen();
    await utils.findByTestId('adapter-apply');

    await act(async () => {
      fireEvent.press(utils.getByTestId('adapter-apply'));
    });

    expect(applyProposal).toHaveBeenCalledWith('prop-9');
    expect(alertSpy).toHaveBeenCalledWith('Applied', expect.stringContaining('updated'));
    expect(mockGoBack).toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('Dismiss → Alert confirm → dismissProposal → goBack', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const utils = renderScreen();
    await utils.findByTestId('adapter-dismiss');

    fireEvent.press(utils.getByTestId('adapter-dismiss'));
    const confirm = (alertSpy.mock.calls[0][2] as any[]).find((b) => b.text === 'Dismiss');
    await act(async () => {
      await confirm.onPress();
    });

    expect(dismissProposal).toHaveBeenCalledWith('prop-9');
    expect(mockGoBack).toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('Preview navigates to the per-command detail screen', async () => {
    const utils = renderScreen();
    await utils.findByTestId('adapter-preview');

    fireEvent.press(utils.getByTestId('adapter-preview'));

    expect(mockNavigate).toHaveBeenCalledWith('AdapterProposalDetail', { proposalId: 'prop-9' });
  });

  it('an already-decided (non-pending) proposal hides the actions and shows the status', async () => {
    (getProposal as jest.Mock).mockResolvedValue({ ...PROPOSAL, status: 'applied' });
    const utils = renderScreen();
    await utils.findByText('New skill: kitchen timers');

    expect(utils.queryByTestId('adapter-apply')).toBeNull();
    expect(utils.getByText('Status: applied')).toBeTruthy();
  });

  it('load error → error text + Retry that re-loads successfully', async () => {
    // First load: inbox item with no proposal_id → error branch.
    (getInboxItem as jest.Mock).mockResolvedValueOnce({ ...INBOX_ITEM, metadata: {} });
    const utils = renderScreen();
    await utils.findByText('Proposal id missing from inbox item');

    fireEvent.press(utils.getByTestId('adapter-retry'));

    await utils.findByText('New skill: kitchen timers');
    expect(utils.getByTestId('adapter-apply')).toBeTruthy();
  });
});
