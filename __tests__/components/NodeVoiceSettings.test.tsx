import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import { NodeVoiceSettings } from '../../src/components/NodeVoiceSettings';
import { lightTheme } from '../../src/theme';
import { updateNodeConfig } from '../../src/api/nodeApi';
import { useSettingsSnapshot } from '../../src/hooks/useSettingsSnapshot';

jest.mock('../../src/api/nodeApi', () => ({
  updateNodeConfig: jest.fn(),
  triggerAmbientNoiseMeasurement: jest.fn(),
  pollAmbientNoiseResult: jest.fn(),
}));

jest.mock('../../src/hooks/useSettingsSnapshot', () => ({
  useSettingsSnapshot: jest.fn(),
}));

const mockedUpdate = updateNodeConfig as jest.MockedFunction<typeof updateNodeConfig>;
const mockedSnapshot = useSettingsSnapshot as jest.MockedFunction<typeof useSettingsSnapshot>;

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PaperProvider theme={lightTheme}>{children}</PaperProvider>
);

// The six legacy knobs that already round-trip today — included so the new-key
// tests can also assert the legacy payload isn't dropped (no regression).
const LEGACY_CONFIG = {
  wake_word_threshold: 0.6,
  silence_threshold: 4000,
  silence_duration: 0.5,
  barge_in_enabled: true,
  wake_ack_audio_enabled: true,
  follow_up_listen_seconds: 4,
  follow_up_silence_duration: 0.5,
  follow_up_min_record_after_onset_secs: 0.7,
  follow_up_min_speech_secs: 0.3,
  volume_percent: 80,
};

function mockSnapshot(nodeConfig: Record<string, unknown> | undefined, state = 'loaded') {
  mockedSnapshot.mockReturnValue({
    snapshot: nodeConfig === undefined ? null : ({ node_config: nodeConfig } as never),
    state: state as never,
    error: null,
    resolvedNodeId: 'node-1',
    refetch: jest.fn(),
  });
}

describe('NodeVoiceSettings — four new node tunables (#54)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUpdate.mockResolvedValue(undefined as never);
  });

  // Happy path
  it('test_seeds_four_new_keys_from_snapshot', () => {
    mockSnapshot({
      ...LEGACY_CONFIG,
      wake_word_model: 'alexa',
      not_for_me_quiet_seconds: 30,
      audio_output_device: 'plughw:1,0',
      mic_sample_rate: 44100,
    });

    const { getByDisplayValue, getByText } = render(
      <NodeVoiceSettings nodeId="node-1" />,
      { wrapper },
    );

    // String fields surface as editable text inputs showing the seeded values.
    expect(getByDisplayValue('alexa')).toBeTruthy();
    expect(getByDisplayValue('plughw:1,0')).toBeTruthy();
    // Numeric fields surface their seeded display values.
    expect(getByText('30s')).toBeTruthy();
    expect(getByText('44100')).toBeTruthy();
  });

  it('test_save_payload_includes_four_new_keys', async () => {
    mockSnapshot({
      ...LEGACY_CONFIG,
      wake_word_model: 'alexa',
      not_for_me_quiet_seconds: 30,
      audio_output_device: 'plughw:1,0',
      mic_sample_rate: 48000,
    });

    const { getByDisplayValue, getByText, getByTestId } = render(
      <NodeVoiceSettings nodeId="node-1" />,
      { wrapper },
    );

    fireEvent.changeText(getByDisplayValue('alexa'), 'hey_mycroft');
    fireEvent.changeText(getByDisplayValue('plughw:1,0'), 'plughw:2,0');
    fireEvent(getByTestId('slider-not_for_me_quiet_seconds'), 'valueChange', 25);
    fireEvent(getByTestId('slider-mic_sample_rate'), 'valueChange', 44100);

    fireEvent.press(getByText('Save Changes'));

    await waitFor(() => {
      expect(mockedUpdate).toHaveBeenCalledWith(
        'node-1',
        expect.objectContaining({
          // the four new keys, edited
          wake_word_model: 'hey_mycroft',
          not_for_me_quiet_seconds: 25,
          audio_output_device: 'plughw:2,0',
          mic_sample_rate: 44100,
          // legacy keys still present (no regression to handleSave)
          wake_word_threshold: 0.6,
          volume_percent: 80,
          barge_in_enabled: true,
        }),
        false,
      );
    });
  });

  // Edge cases
  it('test_defaults_when_keys_absent_from_snapshot', () => {
    // Only the legacy six present — the real backfill case for existing nodes.
    mockSnapshot({ ...LEGACY_CONFIG });

    const { getByDisplayValue, getByText } = render(
      <NodeVoiceSettings nodeId="node-1" />,
      { wrapper },
    );

    // wake_word_model default 'hey_jarvis', audio_output_device default '' (auto).
    expect(getByDisplayValue('hey_jarvis')).toBeTruthy();
    expect(getByDisplayValue('')).toBeTruthy();
    // not_for_me_quiet_seconds default 20, mic_sample_rate default 48000.
    expect(getByText('20s')).toBeTruthy();
    expect(getByText('48000')).toBeTruthy();
  });

  it('test_mic_sample_rate_constrained_to_allowed_values', async () => {
    mockSnapshot({ ...LEGACY_CONFIG, mic_sample_rate: 48000 });

    const { getByTestId, getByText } = render(
      <NodeVoiceSettings nodeId="node-1" />,
      { wrapper },
    );

    // The control only permits {44100, 48000}: a stepped slider whose min/max/step
    // span exactly the two allowed rates and nothing in between.
    const slider = getByTestId('slider-mic_sample_rate');
    expect(slider.props.minimumValue).toBe(44100);
    expect(slider.props.maximumValue).toBe(48000);
    expect(slider.props.step).toBe(3900); // 48000 - 44100 → only the two stops

    // Selecting the other option puts exactly 44100 (an int) into the payload.
    fireEvent(slider, 'valueChange', 44100);
    fireEvent.press(getByText('Save Changes'));

    await waitFor(() => {
      expect(mockedUpdate).toHaveBeenCalledWith(
        'node-1',
        expect.objectContaining({ mic_sample_rate: 44100 }),
        false,
      );
    });
    const payload = mockedUpdate.mock.calls[0][1] as Record<string, unknown>;
    expect(Number.isInteger(payload.mic_sample_rate)).toBe(true);
  });

  it('test_string_fields_render_and_edit', async () => {
    mockSnapshot({
      ...LEGACY_CONFIG,
      wake_word_model: 'alexa',
      audio_output_device: 'plughw:1,0',
      mic_sample_rate: 48000,
    });

    const { getByDisplayValue, getByText } = render(
      <NodeVoiceSettings nodeId="node-1" />,
      { wrapper },
    );

    fireEvent.changeText(getByDisplayValue('alexa'), 'hey_custom');
    // Clearing audio_output_device back to '' must be preserved as empty (auto),
    // not dropped from the payload.
    fireEvent.changeText(getByDisplayValue('plughw:1,0'), '');

    fireEvent.press(getByText('Save Changes'));

    await waitFor(() => {
      expect(mockedUpdate).toHaveBeenCalledWith(
        'node-1',
        expect.objectContaining({
          wake_word_model: 'hey_custom',
          audio_output_device: '',
        }),
        false,
      );
    });
    const payload = mockedUpdate.mock.calls[0][1] as Record<string, unknown>;
    expect(payload).toHaveProperty('audio_output_device', '');
  });

  // Error / exception flow
  it('test_save_failure_preserves_dirty_state', async () => {
    mockedUpdate.mockRejectedValue(new Error('network'));
    mockSnapshot({ ...LEGACY_CONFIG, wake_word_model: 'alexa', mic_sample_rate: 48000 });

    const { getByDisplayValue, getByText } = render(
      <NodeVoiceSettings nodeId="node-1" />,
      { wrapper },
    );

    fireEvent.changeText(getByDisplayValue('alexa'), 'hey_mycroft');
    fireEvent.press(getByText('Save Changes'));

    // The rejection is caught (handleSave's catch logs); no unhandled throw, and
    // the Save button stays available for retry because dirty isn't cleared.
    await waitFor(() => {
      expect(getByText('Save Changes')).toBeTruthy();
    });
  });
});
