import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import CredentialsScreen from '../../src/screens/Household/CredentialsScreen';
import CredentialDetailScreen from '../../src/screens/Household/CredentialDetailScreen';
import { lightTheme } from '../../src/theme';
import { listNodes } from '../../src/api/nodeApi';
import { hasK2 } from '../../src/services/k2Service';
import { fetchSettingsSnapshot } from '../../src/services/settingsSnapshotFetch';
import { encryptAndPushConfig } from '../../src/services/configPushService';

const mockNavigate = jest.fn();
let mockParams: any;
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn(), setOptions: jest.fn() }),
  useRoute: () => ({ params: mockParams }),
}));
jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({ state: { activeHouseholdId: 'hh', accessToken: 'tok', user: { id: 7 } } }),
}));
jest.mock('../../src/api/nodeApi', () => ({ listNodes: jest.fn() }));
jest.mock('../../src/api/householdApi', () => ({ listHouseholdMembers: jest.fn().mockResolvedValue([]) }));
jest.mock('../../src/services/k2Service', () => ({ hasK2: jest.fn() }));
jest.mock('../../src/services/settingsSnapshotFetch', () => ({ fetchSettingsSnapshot: jest.fn() }));
jest.mock('../../src/services/configPushService', () => ({ encryptAndPushConfig: jest.fn() }));

const node = (id: string, room: string) => ({ node_id: id, room, online: true, household_id: 'hh' }) as any;
const secret = (key: string, over: Record<string, unknown> = {}) => ({
  key, friendly_name: key === 'API_KEY' ? 'API key' : key, scope: 'integration', description: 'From the provider',
  value_type: 'str', required: true, is_sensitive: true, is_set: true, ...over,
});
const snap = (commands: any[]) => ({ schema_version: 1, commands_schema_version: 1, commands, agents: [], device_families: [] });

let client: QueryClient;
afterEach(() => client?.clear());
const renderWith = (el: React.ReactElement) => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(
    <QueryClientProvider client={client}>
      <PaperProvider theme={lightTheme}>{el}</PaperProvider>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = undefined;
  (listNodes as jest.Mock).mockResolvedValue([node('k', 'Kitchen'), node('o', 'Office'), node('b', 'Bedroom')]);
  (hasK2 as jest.Mock).mockImplementation(async (id: string) => id !== 'b');
  (fetchSettingsSnapshot as jest.Mock).mockImplementation(async (id: string) =>
    id === 'k'
      ? snap([{ command_name: 'weather', associated_service: 'OpenWeather', description: '', secrets: [secret('API_KEY')] }])
      : snap([
          { command_name: 'weather', associated_service: 'OpenWeather', description: '', secrets: [secret('API_KEY', { is_set: false })] },
          { command_name: 'music', associated_service: 'Spotify', description: '', secrets: [secret('SPOTIFY_USER', { scope: 'user', is_sensitive: false, value: 'me' })] },
        ]),
  );
  (encryptAndPushConfig as jest.Mock).mockResolvedValue(undefined);
});

describe('Credentials list', () => {
  it('puts what needs you first, then what is set, and lists nodes it cannot read', async () => {
    const utils = renderWith(<CredentialsScreen />);
    const needs = await utils.findByTestId('credentials-needs');
    expect(needs).toBeTruthy();
    expect(await utils.findByText('Shared · Kitchen and Office')).toBeTruthy(); // OpenWeather, unset on Office
    expect(utils.getByText('Personal · Office')).toBeTruthy(); // Spotify
    expect(utils.getByText('Bedroom')).toBeTruthy();
    expect(utils.getByText('This phone has no key for it')).toBeTruthy();
    fireEvent.press(utils.getByTestId('credentials-node-b'));
    expect(mockNavigate).toHaveBeenCalledWith('ImportKey');
    fireEvent.press(utils.getByTestId('credential-service:OpenWeather'));
    expect(mockNavigate).toHaveBeenCalledWith('CredentialDetail', { id: 'service:OpenWeather', nodeId: undefined });
  });

  it('shows one node’s credentials when opened from its card', async () => {
    mockParams = { nodeId: 'k' };
    const utils = renderWith(<CredentialsScreen />);
    expect(await utils.findByText('Shared · Kitchen')).toBeTruthy();
    expect(utils.queryByText(/Spotify/)).toBeNull();
    expect(fetchSettingsSnapshot).toHaveBeenCalledTimes(1);
  });
});

describe('One credential', () => {
  it('saves a field to the ticked nodes only, and says where', async () => {
    mockParams = { id: 'service:OpenWeather' };
    const utils = renderWith(<CredentialDetailScreen />);
    fireEvent.press(await utils.findByTestId('credential-field-API_KEY'));
    expect(await utils.findByText('Saves to Kitchen and Office.')).toBeTruthy();
    fireEvent.press(utils.getByText('Cancel'));

    // Untick Kitchen: the next save goes to Office alone.
    fireEvent.press(utils.getByTestId('credential-node-k'));
    fireEvent.press(utils.getByTestId('credential-field-API_KEY'));
    expect(await utils.findByText('Saves to Office.')).toBeTruthy();
    fireEvent.changeText(utils.getByTestId('secret-value-input'), 'abc');
    await act(async () => {
      fireEvent.press(utils.getByText('Save'));
    });
    expect(encryptAndPushConfig).toHaveBeenCalledTimes(1);
    expect(encryptAndPushConfig).toHaveBeenCalledWith('o', 'settings:secrets', { API_KEY: 'abc' });
    expect(await utils.findByText('API key saved on Office')).toBeTruthy();
    // The node is asked again in the background; the screen stays.
    await waitFor(() => expect(fetchSettingsSnapshot).toHaveBeenCalledWith('o'));
    expect(utils.getByTestId('credential-field-API_KEY')).toBeTruthy();
  });

  it('saves to every ticked node, and names the ones that did not answer', async () => {
    mockParams = { id: 'service:OpenWeather' };
    (encryptAndPushConfig as jest.Mock).mockImplementation(async (id: string) => {
      if (id === 'k') throw new Error('offline');
    });
    const utils = renderWith(<CredentialDetailScreen />);
    fireEvent.press(await utils.findByTestId('credential-field-API_KEY'));
    fireEvent.changeText(utils.getByTestId('secret-value-input'), 'abc');
    await act(async () => {
      fireEvent.press(utils.getByText('Save'));
    });
    expect(encryptAndPushConfig).toHaveBeenCalledWith('k', 'settings:secrets', { API_KEY: 'abc' });
    expect(encryptAndPushConfig).toHaveBeenCalledWith('o', 'settings:secrets', { API_KEY: 'abc' });
    expect(await utils.findByText("Saved, except on 1 node that didn't answer.")).toBeTruthy();
  });

  it('tags a personal field and saves it as the member\u2019s own', async () => {
    mockParams = { id: 'service:Spotify' };
    const utils = renderWith(<CredentialDetailScreen />);
    const row = await utils.findByTestId('credential-field-SPOTIFY_USER');
    expect(utils.getByText('Personal \u00b7 me')).toBeTruthy();
    fireEvent.press(row);
    fireEvent.changeText(utils.getByTestId('secret-value-input'), 'you');
    await act(async () => {
      fireEvent.press(utils.getByText('Save'));
    });
    expect(encryptAndPushConfig).toHaveBeenCalledWith('o', 'settings:secrets', { SPOTIFY_USER: 'you', __user_id__: '7' });
  });
});
