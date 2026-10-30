import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import VoiceProfileScreen from '../../src/screens/Settings/VoiceProfileScreen';
import { lightTheme } from '../../src/theme';
import { deleteVoiceProfile, getNodeEnrollmentResult, getVoiceProfileStatus, startNodeEnrollment } from '../../src/api/voiceProfileApi';
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

  it('records on a desktop agent that supports enrollment', async () => {
    (listNodes as jest.Mock).mockResolvedValue([
      { node_id: 'pi-1', room: 'Kitchen', online: true, user: null, install_mode: 'tarball', node_kind: null, name: 'kitchen-pi' },
      { node_id: 'agent-1', room: 'Office PC', online: true, user: null, install_mode: 'desktop-agent', node_kind: 'desktop', capabilities: { voice_enrollment: true } },
    ]);
    (startNodeEnrollment as jest.Mock).mockReturnValue(new Promise(() => {}));
    const { findByText, findByTestId, getByTestId, getByText } = renderScreen();

    fireEvent.press(await findByText('Start Enrollment'));
    const pi = await findByTestId('voice-target-kind-pi-1');
    expect(pi.props.accessibilityLabel).toBe('Raspberry Pi');
    expect(getByTestId('voice-target-kind-agent-1').props.accessibilityLabel).toBe('Computer');
    await act(async () => {
      fireEvent.press(getByText('Office PC'));
    });
    await waitFor(() => expect(startNodeEnrollment).toHaveBeenCalled());
    expect((startNodeEnrollment as jest.Mock).mock.calls[0][0]).toBe('agent-1');
    expect(await findByText(/^Recording on Office PC/)).toBeTruthy();
  });
});

describe('VoiceProfileScreen — household enrollment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getVoiceProfileStatus as jest.Mock).mockResolvedValue({
      has_profile: true, sample_count: 6, recognition_enabled: true,
    });
    (listNodes as jest.Mock).mockResolvedValue([
      { node_id: 'pi-2', room: 'Bedroom', online: true },
      { node_id: 'old-agent', room: 'Old computer', online: true, node_kind: 'desktop' },
    ]);
    (startNodeEnrollment as jest.Mock).mockReturnValue(new Promise(() => {}));
  });

  it('adds samples from another device without deleting earlier enrollments', async () => {
    const ui = renderScreen();
    fireEvent.press(await ui.findByText('Add Another Device'));
    fireEvent.press(await ui.findByText('Bedroom'));
    await waitFor(() => expect(startNodeEnrollment).toHaveBeenCalled());
    expect((startNodeEnrollment as jest.Mock).mock.calls[0][0]).toBe('pi-2');
    expect(deleteVoiceProfile).not.toHaveBeenCalled();
  });

  it('keeps the combined sample count after three takes and allows adding another device', async () => {
    jest.useFakeTimers();
    let sampleCount = 6;
    (getVoiceProfileStatus as jest.Mock).mockImplementation(async () => ({
      has_profile: true, sample_count: sampleCount, recognition_enabled: true,
    }));
    (startNodeEnrollment as jest.Mock).mockResolvedValue({ request_id: 'take' });
    (getNodeEnrollmentResult as jest.Mock).mockImplementation(async () => {
      sampleCount++;
      return { success: true };
    });
    const ui = renderScreen();
    try {
      fireEvent.press(await ui.findByText('Add Another Device'));
      fireEvent.press(await ui.findByText('Bedroom'));
      await ui.findByText(/Take 1 of 3/);
      for (let take = 0; take < 3; take++) {
        await act(async () => { await jest.advanceTimersByTimeAsync(1000); });
      }
      expect(ui.getByText('Enrollment Complete')).toBeTruthy();
      expect(ui.getByText(/Your household profile now has 9 samples, including the new samples from Bedroom/)).toBeTruthy();
      expect(startNodeEnrollment).toHaveBeenCalledTimes(3);
      expect(deleteVoiceProfile).not.toHaveBeenCalled();

      (listNodes as jest.Mock).mockResolvedValue([
        { node_id: 'agent-1', room: 'Office PC', online: true, node_kind: 'desktop', capabilities: { voice_enrollment: true } },
      ]);
      fireEvent.press(ui.getByText('Skip Test'));
      fireEvent.press(ui.getByText('Add Another Device'));
      fireEvent.press(await ui.findByText('Office PC'));
      await waitFor(() => expect(startNodeEnrollment).toHaveBeenLastCalledWith('agent-1', expect.any(String), 8));
      expect(deleteVoiceProfile).not.toHaveBeenCalled();
    } finally {
      ui.unmount();
      jest.useRealTimers();
    }
  });

  it.each([
    [undefined, 'Update the Jarvis agent to record voice samples'],
    [false, 'Voice recording is not available on this computer'],
  ])('explains unavailable desktop recording (%s) instead of starting a timeout', async (supported, explanation) => {
    (listNodes as jest.Mock).mockResolvedValue([
      { node_id: 'old-agent', room: 'Old computer', online: true, node_kind: 'desktop', capabilities: { voice_enrollment: supported } },
    ]);
    const ui = renderScreen();
    fireEvent.press(await ui.findByText('Add One More Sample'));
    fireEvent.press(await ui.findByText('Old computer'));
    expect(ui.getByText(explanation)).toBeTruthy();
    expect(startNodeEnrollment).not.toHaveBeenCalled();
    expect(deleteVoiceProfile).not.toHaveBeenCalled();
  });
});
