import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import HouseholdEditScreen from '../../src/screens/Settings/HouseholdEditScreen';
import { lightTheme } from '../../src/theme';
import authApi from '../../src/api/authApi';
import { setHouseholdSetting } from '../../src/api/householdSettingsApi';

// L1 FLOW INTEGRATION — the Household admin surface (no prior coverage): the
// member/invite load, admin-gated rename (PATCH + household refresh), change-role
// via the per-member menu, remove-member (destructive confirm → DELETE → row
// gone), create-invite through the dialog (POST with role/expiry body), revoke
// invite (confirm → DELETE → "Revoked"), and leave-household (confirm → POST →
// refresh + goBack). Real screen + real state; nav/route are props, only the
// authApi axios client + auth context are mocked.

jest.mock('../../src/api/authApi', () => ({
  __esModule: true,
  default: { get: jest.fn(), patch: jest.fn(), post: jest.fn(), delete: jest.fn() },
}));

jest.mock('../../src/api/householdSettingsApi', () => ({
  __esModule: true,
  getHouseholdSettings: jest.fn(() =>
    Promise.resolve({ 'web_search.enabled': false, 'household.location': '' }),
  ),
  setHouseholdSetting: jest.fn(() => Promise.resolve()),
}));

const mockFetchHouseholds = jest.fn();
let mockAuthState: any;
jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({ state: mockAuthState, fetchHouseholds: mockFetchHouseholds }),
}));

const ME = { user_id: 1, username: 'me', email: 'me@test.com', role: 'admin' };
const BOB = { user_id: 2, username: 'bob', email: 'bob@test.com', role: 'member' };
const INVITE = {
  id: 10,
  code: 'ABC123',
  default_role: 'member',
  max_uses: null,
  use_count: 0,
  expires_at: '2999-01-01T00:00:00Z',
  revoked: false,
  created_at: '2026-01-01T00:00:00Z',
};

const HEADERS = { headers: { Authorization: 'Bearer tok' } };

const get = authApi.get as jest.Mock;
const patch = authApi.patch as jest.Mock;
const post = authApi.post as jest.Mock;
const del = authApi.delete as jest.Mock;

const makeNav = () => ({ goBack: jest.fn(), navigate: jest.fn(), setOptions: jest.fn() }) as any;

const renderScreen = (members = [ME, BOB], invites = [INVITE], nav = makeNav()) => {
  get.mockImplementation((url: string) => {
    if (url.includes('/members')) return Promise.resolve({ data: members });
    if (url.includes('/invites')) return Promise.resolve({ data: invites });
    return Promise.resolve({ data: [] });
  });
  const utils = render(
    <PaperProvider theme={lightTheme}>
      <HouseholdEditScreen
        navigation={nav}
        route={{ params: { householdId: 'hh-1', householdName: 'Home' }, key: 'k', name: 'HouseholdEdit' } as any}
      />
    </PaperProvider>,
  );
  return { ...utils, nav };
};

describe('Household edit — flow integration (rename, roles, members, invites, leave)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState = {
      accessToken: 'tok',
      user: { id: 1, email: 'me@test.com' },
      households: [{ id: 'hh-1' }, { id: 'hh-2' }], // length > 1 → canLeave
    };
    patch.mockResolvedValue({ data: {} });
    del.mockResolvedValue({ data: {} });
    post.mockResolvedValue({ data: { ...INVITE, id: 11, code: 'NEW999', default_role: 'power_user' } });
  });

  it('loads and renders members + invite codes', async () => {
    const utils = renderScreen();
    await utils.findByText('bob@test.com');
    expect(utils.getByText('me@test.com')).toBeTruthy();
    expect(utils.getByText('ABC123')).toBeTruthy();
    expect(get).toHaveBeenCalledWith('/households/hh-1/members', HEADERS);
    expect(get).toHaveBeenCalledWith('/households/hh-1/invites', HEADERS);
  });

  it('admin rename → PATCH /households/:id then refreshes households', async () => {
    const utils = renderScreen();
    await utils.findByTestId('household-save-name'); // Save renders only once isAdmin resolves

    fireEvent.changeText(utils.getByTestId('household-name-input'), 'Beach House');
    await act(async () => {
      fireEvent.press(utils.getByTestId('household-save-name'));
    });

    expect(patch).toHaveBeenCalledWith('/households/hh-1', { name: 'Beach House' }, HEADERS);
    expect(mockFetchHouseholds).toHaveBeenCalled();
  });

  it('change a member role via the menu → PATCH members/:userId', async () => {
    const utils = renderScreen();
    await utils.findByText('bob@test.com');

    fireEvent.press(utils.getByTestId('member-role-chip-2')); // open the role menu
    const opt = await utils.findByTestId('role-opt-2-power_user');
    await act(async () => {
      fireEvent.press(opt);
    });

    expect(patch).toHaveBeenCalledWith(
      '/households/hh-1/members/2',
      { role: 'power_user' },
      HEADERS,
    );
  });

  it('remove member → Alert confirm → DELETE → row disappears', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const utils = renderScreen();
    await utils.findByText('bob@test.com');

    fireEvent.press(utils.getByTestId('member-remove-2'));
    const del2 = (alertSpy.mock.calls[0][2] as any[]).find((b) => b.text === 'Remove');
    await act(async () => {
      await del2.onPress();
    });

    expect(del).toHaveBeenCalledWith('/households/hh-1/members/2', HEADERS);
    await waitFor(() => expect(utils.queryByText('bob@test.com')).toBeNull());
    alertSpy.mockRestore();
  });

  it('create invite through the dialog → POST with the chosen role + expiry', async () => {
    const utils = renderScreen();
    await utils.findByText('bob@test.com');

    fireEvent.press(utils.getByTestId('invite-create-open'));
    fireEvent.press(await utils.findByText('Power User')); // default-role segmented button
    fireEvent.press(utils.getByText('30')); // expires-in-days segmented button

    await act(async () => {
      fireEvent.press(utils.getByTestId('invite-create-submit'));
    });

    expect(post).toHaveBeenCalledWith(
      '/households/hh-1/invites',
      { default_role: 'power_user', expires_in_days: 30 },
      HEADERS,
    );
    await utils.findByText('NEW999'); // new code prepended to the list
  });

  it('revoke invite → Alert confirm → DELETE → marked Revoked', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const utils = renderScreen();
    await utils.findByText('ABC123');

    fireEvent.press(utils.getByTestId('invite-revoke-10'));
    const revoke = (alertSpy.mock.calls[0][2] as any[]).find((b) => b.text === 'Revoke');
    await act(async () => {
      await revoke.onPress();
    });

    expect(del).toHaveBeenCalledWith('/households/hh-1/invites/10', HEADERS);
    await utils.findByText('Revoked');
    alertSpy.mockRestore();
  });

  it('leave household → Alert confirm → POST /leave → refresh + goBack', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    post.mockResolvedValueOnce({ data: {} });
    const utils = renderScreen();
    await utils.findByTestId('household-leave');

    fireEvent.press(utils.getByTestId('household-leave'));
    const leave = (alertSpy.mock.calls[0][2] as any[]).find((b) => b.text === 'Leave');
    await act(async () => {
      await leave.onPress();
    });

    expect(post).toHaveBeenCalledWith('/households/hh-1/leave', {}, HEADERS);
    expect(mockFetchHouseholds).toHaveBeenCalled();
    expect(utils.nav.goBack).toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('admin toggles web search on → PUT household setting', async () => {
    const setSetting = setHouseholdSetting as jest.Mock;
    const utils = renderScreen();
    const toggle = await utils.findByTestId('household-web-search-toggle');

    await act(async () => {
      fireEvent(toggle, 'valueChange', true);
    });

    expect(setSetting).toHaveBeenCalledWith('hh-1', 'web_search.enabled', true);
  });

  // Location biases business lookups — a search for "Tony's Pizzeria" once
  // resolved to a Maryland listing for a New Jersey household and the call
  // went to the wrong business.
  it('admin sets the household location → PUT trimmed value', async () => {
    const setSetting = setHouseholdSetting as jest.Mock;
    setSetting.mockClear();
    const utils = renderScreen();
    const input = await utils.findByTestId('household-location-input');

    await act(async () => {
      fireEvent.changeText(input, '  Springfield, IL 62704  ');
    });
    await act(async () => {
      fireEvent(input, 'blur');
    });

    expect(setSetting).toHaveBeenCalledWith('hh-1', 'household.location', 'Springfield, IL 62704');
  });

  it('leaving the location untouched writes nothing', async () => {
    const setSetting = setHouseholdSetting as jest.Mock;
    setSetting.mockClear();
    const utils = renderScreen();
    const input = await utils.findByTestId('household-location-input');

    await act(async () => {
      fireEvent(input, 'blur');
    });

    expect(setSetting).not.toHaveBeenCalled();
  });
});
