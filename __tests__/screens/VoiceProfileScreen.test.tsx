import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import VoiceProfileScreen from '../../src/screens/Settings/VoiceProfileScreen';
import { lightTheme } from '../../src/theme';
import { getVoiceProfileStatus, startNodeEnrollment } from '../../src/api/voiceProfileApi';
import { listNodes } from '../../src/api/nodeApi';

// The household's speaker recognition (voice.recognition_enabled) is OFF by
// default and enrolling does not turn it on (jarvisd D35/M14). The status
// response carries `recognition_enabled`; the screen must say so when it's
// false while keeping enrollment usable.

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
}));

jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({ state: { activeHouseholdId: 'hh-1' } }),
}));

jest.mock('../../src/theme/ThemeProvider', () => ({
  useThemePreference: () => ({
    paperTheme: require('../../src/theme').lightTheme,
  }),
}));

jest.mock('../../src/api/voiceProfileApi', () => ({
  getVoiceProfileStatus: jest.fn(),
  deleteVoiceProfile: jest.fn(),
  getNodeEnrollmentResult: jest.fn(),
  startNodeEnrollment: jest.fn(),
  startNodeVerification: jest.fn(),
}));

jest.mock('../../src/components/HelpIcon', () => ({ HelpIcon: () => null }));

jest.mock('../../src/api/nodeApi', () => ({ listNodes: jest.fn().mockResolvedValue([]) }));

const renderScreen = () =>
  render(
    <PaperProvider theme={lightTheme}>
      <VoiceProfileScreen />
    </PaperProvider>,
  );

describe('VoiceProfileScreen — speaker recognition notice', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows the notice and keeps enrollment available when recognition is off (no profile)', async () => {
    (getVoiceProfileStatus as jest.Mock).mockResolvedValue({
      has_profile: false,
      sample_count: 0,
      recognition_enabled: false,
    });
    const { findByTestId, getByText } = renderScreen();

    await findByTestId('voice-recognition-off-notice');
    expect(getByText('Speaker recognition is off for this household')).toBeTruthy();
    expect(getByText(/voice\.recognition_enabled/)).toBeTruthy();
    expect(getByText('Start Enrollment')).toBeTruthy();
    expect(getVoiceProfileStatus).toHaveBeenCalledWith('hh-1');
  });

  it('shows the notice on the enrolled view too', async () => {
    (getVoiceProfileStatus as jest.Mock).mockResolvedValue({
      has_profile: true,
      sample_count: 3,
      recognition_enabled: false,
    });
    const { findByText, getByTestId } = renderScreen();

    await findByText('Voice Profile Active');
    expect(getByTestId('voice-recognition-off-notice')).toBeTruthy();
  });

  it('hides the notice when recognition is on', async () => {
    (getVoiceProfileStatus as jest.Mock).mockResolvedValue({
      has_profile: true,
      sample_count: 3,
      recognition_enabled: true,
    });
    const { findByText, queryByTestId } = renderScreen();

    await findByText('Voice Profile Active');
    expect(queryByTestId('voice-recognition-off-notice')).toBeNull();
  });

  it('hides the notice when the server does not report the field (older server)', async () => {
    (getVoiceProfileStatus as jest.Mock).mockResolvedValue({
      has_profile: false,
      sample_count: 0,
    });
    const { findByText, queryByTestId } = renderScreen();

    await findByText('Start Enrollment');
    await waitFor(() => expect(queryByTestId('voice-recognition-off-notice')).toBeNull());
  });
});

describe('VoiceProfileScreen — node picker kinds', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getVoiceProfileStatus as jest.Mock).mockResolvedValue({
      has_profile: false,
      sample_count: 0,
      recognition_enabled: true,
    });
  });

  it('lists a Pi with its icon and shows a computer as unable to record yet', async () => {
    (listNodes as jest.Mock).mockResolvedValue([
      { node_id: 'pi-1', room: 'Kitchen', online: true, user: null, install_mode: 'tarball', node_kind: null },
      { node_id: 'agent-1', room: 'Office PC', online: true, user: null, install_mode: 'desktop-agent', node_kind: 'desktop' },
    ]);
    (startNodeEnrollment as jest.Mock).mockReturnValue(new Promise(() => {}));
    const { findByText, findByTestId, getByTestId, getByText } = renderScreen();

    fireEvent.press(await findByText('Start Enrollment'));
    const pi = await findByTestId('voice-target-kind-pi-1');
    expect(pi.props.accessibilityLabel).toBe('Raspberry Pi');
    expect(getByTestId('voice-target-kind-agent-1').props.accessibilityLabel).toBe('Computer');
    expect(getByText('Not needed: Jarvis uses the account signed in to the agent')).toBeTruthy();

    // The agent has no enroll_voice handler: picking it must not start a
    // 60-second wait for a recording that never comes.
    await act(async () => {
      fireEvent.press(getByText('Office PC'));
    });
    expect(startNodeEnrollment).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(getByText('Kitchen'));
    });
    await waitFor(() => expect(startNodeEnrollment).toHaveBeenCalled());
    expect((startNodeEnrollment as jest.Mock).mock.calls[0][0]).toBe('pi-1');
    expect(await findByText(/^Recording on Kitchen/)).toBeTruthy();
  });
});

