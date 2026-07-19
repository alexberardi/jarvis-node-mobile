import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import InboxAudioPlayer from '../../src/components/InboxAudioPlayer';
import { downloadInboxAudio } from '../../src/services/inboxAudioService';
import { lightTheme } from '../../src/theme';

const mockCreateAsync = jest.fn();
const mockSetAudioModeAsync = jest.fn();

jest.mock('expo-av', () => ({
  Audio: {
    Sound: { createAsync: (...args: any[]) => mockCreateAsync(...args) },
    setAudioModeAsync: (...args: any[]) => mockSetAudioModeAsync(...args),
  },
}));

jest.mock('@react-native-community/slider', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: (props: any) => <View {...props} /> };
});

jest.mock('../../src/services/inboxAudioService', () => ({
  ...jest.requireActual('../../src/services/inboxAudioService'),
  downloadInboxAudio: jest.fn(),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PaperProvider theme={lightTheme}>{children}</PaperProvider>
);

const audio = { url: '/api/v0/phone/sessions/s1/audio', duration_seconds: 90, title: 'Call to Tony\'s' };

describe('InboxAudioPlayer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders title and clock from duration metadata without loading anything', () => {
    const { getByText, getByTestId } = render(<InboxAudioPlayer audio={audio} />, { wrapper });
    expect(getByText("Call to Tony's")).toBeTruthy();
    expect(getByText('0:00 / 1:30')).toBeTruthy();
    expect(getByTestId('inbox-audio-toggle')).toBeTruthy();
    expect(downloadInboxAudio).not.toHaveBeenCalled();
  });

  it('downloads through the authenticated cache and plays on first tap', async () => {
    const playAsync = jest.fn();
    (downloadInboxAudio as jest.Mock).mockResolvedValue('file:///cache/inbox-audio/x.wav');
    mockCreateAsync.mockResolvedValue({ sound: { playAsync, pauseAsync: jest.fn(), unloadAsync: jest.fn() } });

    const { getByTestId } = render(<InboxAudioPlayer audio={audio} />, { wrapper });
    fireEvent.press(getByTestId('inbox-audio-toggle'));

    await waitFor(() => expect(playAsync).toHaveBeenCalled());
    expect(downloadInboxAudio).toHaveBeenCalledWith(audio.url);
    expect(mockCreateAsync).toHaveBeenCalledWith(
      { uri: 'file:///cache/inbox-audio/x.wav' },
      { shouldPlay: false },
      expect.any(Function),
    );
  });

  it('shows a retryable error state when the download fails', async () => {
    (downloadInboxAudio as jest.Mock).mockRejectedValue(new Error('Audio download failed (HTTP 401)'));

    const { getByTestId, getByText, getByLabelText } = render(
      <InboxAudioPlayer audio={audio} />,
      { wrapper },
    );
    fireEvent.press(getByTestId('inbox-audio-toggle'));

    await waitFor(() => expect(getByText("Couldn't load the audio.")).toBeTruthy());

    // Retry resets to idle so the next tap re-attempts.
    fireEvent.press(getByLabelText('Retry loading audio'));
    expect(getByTestId('inbox-audio-toggle')).toBeTruthy();
  });
});
