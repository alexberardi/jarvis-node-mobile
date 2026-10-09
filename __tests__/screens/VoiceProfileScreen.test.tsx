import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import VoiceProfileScreen from '../../src/screens/Settings/VoiceProfileScreen';
import { lightTheme } from '../../src/theme';
import { getVoiceProfileStatus } from '../../src/api/voiceProfileApi';

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
