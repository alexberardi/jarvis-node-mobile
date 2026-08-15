/**
 * HouseholdEditScreen — the background-presence toggle (Phase 3).
 *
 * Locks the review-flagged behaviours: permission-denied leaves the toggle OFF
 * (and never persists the opt-in), a successful arm turns it ON + persists the
 * opt-in + starts the geofence, and — the finding-1/3 fix — a FAILED arm rolls
 * everything back (stop, un-persist, toggle OFF) so we never leave the switch
 * "on" with nothing monitoring. (The actual keychain token re-key lives in
 * AuthContext.setBackgroundPresence and is asserted in AuthContext.test.tsx;
 * here that dependency is mocked.)
 */
import React from 'react';
import { Alert, Linking } from 'react-native';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import HouseholdEditScreen from '../../src/screens/Settings/HouseholdEditScreen';
import { lightTheme } from '../../src/theme';
import authApi from '../../src/api/authApi';
import {
  ensureBackgroundPermission,
  startHomeGeofence,
  stopHomeGeofence,
} from '../../src/services/backgroundPresenceTask';
import {
  getHomeGeofence,
  isBackgroundPresenceEnabled,
} from '../../src/services/presenceService';

jest.mock('../../src/api/authApi', () => ({
  __esModule: true,
  default: { get: jest.fn(), patch: jest.fn(), post: jest.fn(), delete: jest.fn() },
}));

jest.mock('../../src/api/householdSettingsApi', () => ({
  __esModule: true,
  getHouseholdSettings: jest.fn(() => Promise.resolve({ 'web_search.enabled': false, 'household.location': '' })),
  setHouseholdSetting: jest.fn(() => Promise.resolve()),
  getPersonaPresets: jest.fn(() => Promise.resolve({ presets: [], default_preset_id: null, default_text: '', max_chars: 2000 })),
}));

const mockSetBackgroundPresence = jest.fn(() => Promise.resolve());
jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({
    state: { accessToken: 'tok', user: { id: 1, username: 'Alex' }, activeHouseholdId: 'hh-1', households: [{ id: 'hh-1' }] },
    fetchHouseholds: jest.fn(),
    setBackgroundPresence: mockSetBackgroundPresence,
  }),
}));

const HOME = { latitude: 40.7, longitude: -74, radiusMeters: 150, enabled: true };
jest.mock('../../src/services/presenceService', () => ({
  getHomeGeofence: jest.fn(),
  isBackgroundPresenceEnabled: jest.fn(),
  setHomeGeofence: jest.fn(() => Promise.resolve()),
  clearHomeGeofence: jest.fn(() => Promise.resolve()),
  clearLastPresenceState: jest.fn(() => Promise.resolve()),
  reportIfChanged: jest.fn(() => Promise.resolve({ status: 'unchanged', state: 'home' })),
  captureCurrentLocation: jest.fn(() => Promise.resolve(null)),
  DEFAULT_RADIUS_METERS: 150,
  MIN_RADIUS_METERS: 75,
  MAX_RADIUS_METERS: 1000,
}));

jest.mock('../../src/services/backgroundPresenceTask', () => ({
  ensureBackgroundPermission: jest.fn(),
  startHomeGeofence: jest.fn(),
  stopHomeGeofence: jest.fn(() => Promise.resolve()),
}));

const makeNav = () => ({ goBack: jest.fn(), navigate: jest.fn(), setOptions: jest.fn() }) as any;

const renderScreen = () => {
  (authApi.get as jest.Mock).mockResolvedValue({ data: [] });
  return render(
    <PaperProvider theme={lightTheme}>
      <HouseholdEditScreen
        navigation={makeNav()}
        route={{ params: { householdId: 'hh-1', householdName: 'Home' }, key: 'k', name: 'HouseholdEdit' } as any}
      />
    </PaperProvider>,
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  (getHomeGeofence as jest.Mock).mockResolvedValue(HOME);
  (isBackgroundPresenceEnabled as jest.Mock).mockResolvedValue(false);
  (ensureBackgroundPermission as jest.Mock).mockResolvedValue(true);
  (startHomeGeofence as jest.Mock).mockResolvedValue({ status: 'started' });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined as never);
});

const toggleBg = async (utils: ReturnType<typeof renderScreen>) => {
  const sw = await utils.findByTestId('presence-background-toggle');
  await act(async () => {
    fireEvent(sw, 'valueChange', true);
  });
  return sw;
};

it('the background toggle renders (off) once a home is set + foreground presence is on', async () => {
  const utils = renderScreen();
  const sw = await utils.findByTestId('presence-background-toggle');
  expect(sw.props.value).toBe(false);
});

it('enable + permission granted + geofence armed → persists opt-in, starts geofence, toggle ON', async () => {
  const utils = renderScreen();
  const sw = await toggleBg(utils);

  await waitFor(() => expect(startHomeGeofence).toHaveBeenCalled());
  expect(mockSetBackgroundPresence).toHaveBeenCalledWith(true);
  expect(mockSetBackgroundPresence).not.toHaveBeenCalledWith(false);
  expect(sw.props.value).toBe(true);
});

it('enable + permission DENIED → alert, toggle stays OFF, no opt-in persisted, no geofence', async () => {
  (ensureBackgroundPermission as jest.Mock).mockResolvedValue(false);
  const utils = renderScreen();
  const sw = await toggleBg(utils);

  expect(Alert.alert).toHaveBeenCalled();
  expect(mockSetBackgroundPresence).not.toHaveBeenCalled();
  expect(startHomeGeofence).not.toHaveBeenCalled();
  expect(sw.props.value).toBe(false);
});

it('enable but geofence FAILS to arm → rolls back (un-persist + stop + toggle OFF)', async () => {
  (startHomeGeofence as jest.Mock).mockResolvedValue({ status: 'error', reason: 'boom' });
  const utils = renderScreen();
  const sw = await toggleBg(utils);

  await waitFor(() => expect(mockSetBackgroundPresence).toHaveBeenCalledWith(false));
  expect(mockSetBackgroundPresence).toHaveBeenCalledWith(true); // tried first
  expect(stopHomeGeofence).toHaveBeenCalled();
  expect(Alert.alert).toHaveBeenCalled();
  expect(sw.props.value).toBe(false); // reverted
});
