import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import { NodeVoiceSettings } from '../../src/components/NodeVoiceSettings';
import { NodeMaintenanceSettings } from '../../src/components/NodeMaintenanceSettings';
import { lightTheme } from '../../src/theme';
import { updateNodeConfig } from '../../src/api/nodeApi';
import { useSettingsSnapshot } from '../../src/hooks/useSettingsSnapshot';

// The Voice card used to spin forever unless the snapshot loaded, so a collaborator's Pi whose
// card never loaded couldn't say why. It now says why and offers the fix, and shows the
// node's automatic wake sensitivity, which overrides the slider.

jest.mock('../../src/api/nodeApi', () => ({
  updateNodeConfig: jest.fn().mockResolvedValue(undefined),
  triggerAmbientNoiseMeasurement: jest.fn(),
  pollAmbientNoiseResult: jest.fn(),
}));
jest.mock('../../src/hooks/useSettingsSnapshot', () => ({ useSettingsSnapshot: jest.fn() }));
jest.mock('@react-native-community/slider', () => {
  const { View } = require('react-native');
  return (props: any) => <View {...props} />;
});

const refetch = jest.fn();
const provisionKey = jest.fn().mockResolvedValue(undefined);
const snap = (state: string, extra: object = {}) =>
  (useSettingsSnapshot as jest.Mock).mockReturnValue({ snapshot: null, state, error: null, refetch, provisionKey, ...extra });

const renderVoice = () =>
  render(
    <PaperProvider theme={lightTheme}>
      <NodeVoiceSettings nodeId="n1" />
    </PaperProvider>,
  );

beforeEach(() => jest.clearAllMocks());

it('says the node did not answer and retries', () => {
  snap('timeout', { error: 'Node did not respond in time. Is it online?' });
  const { getByText } = renderVoice();
  expect(getByText('Node did not respond in time. Is it online?')).toBeTruthy();
  fireEvent.press(getByText('Try again'));
  expect(refetch).toHaveBeenCalled();
});

it('offers to set up the encryption key', async () => {
  snap('needs_k2', { error: "This device doesn't have an encryption key yet." });
  const { getByText } = renderVoice();
  fireEvent.press(getByText('Set up encryption key'));
  await waitFor(() => expect(provisionKey).toHaveBeenCalled());
});

it('shows a decryption failure with its reason', () => {
  snap('error', { error: 'Failed to decrypt settings: bad tag' });
  const { getByText } = renderVoice();
  expect(getByText('Failed to decrypt settings: bad tag')).toBeTruthy();
  expect(getByText('Try again')).toBeTruthy();
});

it('says so when the node reports no voice settings', () => {
  snap('loaded', { snapshot: { commands: [] } });
  const { getByText } = renderVoice();
  expect(getByText("This node doesn't report voice settings.")).toBeTruthy();
});

it('shows automatic sensitivity overriding the slider, and turns it off', async () => {
  snap('loaded', { snapshot: { node_config: { wake_word_threshold: 0.9, wake_word_threshold_auto: true } } });
  const { getByTestId, getByText } = renderVoice();
  await waitFor(() => expect(getByText('Automatic')).toBeTruthy());
  expect(getByTestId('wake-threshold-slider').props.disabled).toBe(true);

  fireEvent(getByTestId('wake-threshold-auto'), 'valueChange', false);
  expect(getByText('0.90')).toBeTruthy();
  fireEvent.press(getByText('Save Changes'));
  await waitFor(() => expect(updateNodeConfig).toHaveBeenCalled());
  const payload = (updateNodeConfig as jest.Mock).mock.calls[0][1];
  expect(payload.wake_word_threshold_auto).toBe(false);
  expect(payload.wake_word_threshold).toBe(0.9);
});

it('hides the switch and never sends the key for a node that does not report it', async () => {
  snap('loaded', { snapshot: { node_config: { wake_word_threshold: 0.6, volume_percent: 50 } } });
  const { queryByTestId, getByTestId, getByText } = renderVoice();
  await waitFor(() => expect(getByText('0.60')).toBeTruthy());
  expect(queryByTestId('wake-threshold-auto')).toBeNull();

  fireEvent(getByTestId('wake-threshold-slider'), 'valueChange', 0.7);
  fireEvent.press(getByText('Save Changes'));
  await waitFor(() => expect(updateNodeConfig).toHaveBeenCalled());
  expect((updateNodeConfig as jest.Mock).mock.calls[0][1]).not.toHaveProperty('wake_word_threshold_auto');
});

it('gives the Maintenance card the same states', () => {
  snap('timeout', { error: 'Node did not respond in time. Is it online?' });
  const { getByText } = render(
    <PaperProvider theme={lightTheme}>
      <NodeMaintenanceSettings nodeId="n1" />
    </PaperProvider>,
  );
  fireEvent.press(getByText('Try again'));
  expect(refetch).toHaveBeenCalled();
});
