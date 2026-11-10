import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import { BluetoothSection } from '../../src/components/BluetoothSection';
import { lightTheme } from '../../src/theme';
import {
  getBluetoothStatus,
  pairBluetoothDevice,
  pollBluetoothPair,
  pollBluetoothScan,
  releaseBluetoothDevice,
  requestBluetoothScan,
} from '../../src/api/bluetoothApi';

jest.mock('../../src/api/bluetoothApi', () => ({
  disconnectBluetoothDevice: jest.fn(),
  getBluetoothStatus: jest.fn(),
  makeDiscoverable: jest.fn(),
  pairBluetoothDevice: jest.fn(),
  pollBluetoothPair: jest.fn(),
  pollBluetoothScan: jest.fn(),
  releaseBluetoothDevice: jest.fn(),
  requestBluetoothScan: jest.fn(),
  setBluetoothAutoConnect: jest.fn(),
}));
jest.mock('../../src/components/HelpIcon', () => ({ HelpIcon: () => null }));

const headphones = {
  name: 'WH-1000XM4',
  mac_address: 'AA:BB:CC:DD:EE:01',
  device_type: 'audio_sink',
  paired: false,
  connected: false,
};
const speaker = { ...headphones, name: 'Kitchen Speaker', mac_address: 'AA:BB:CC:DD:EE:02' };

const emptyStatus = { available: true, connected: [], paired: [] };

const renderIt = () =>
  render(
    <PaperProvider theme={lightTheme}>
      <BluetoothSection nodeId="n1" />
    </PaperProvider>,
  );

// Advance fake timers and flush the promises the poll callbacks await.
const tick = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};

const startSpeakerScan = async (utils: ReturnType<typeof renderIt>) => {
  fireEvent.press(utils.getByText('Scan for Devices'));
  await act(async () => {
    fireEvent.press(utils.getByText('Speaker'));
  });
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  (getBluetoothStatus as jest.Mock).mockResolvedValue(emptyStatus);
  (requestBluetoothScan as jest.Mock).mockResolvedValue({ id: 'scan-1', status: 'pending', created_at: '' });
  (pairBluetoothDevice as jest.Mock).mockResolvedValue({ id: 'pair-1', status: 'pending', created_at: '' });
  (pollBluetoothPair as jest.Mock).mockResolvedValue({ status: 'pending', request_id: 'pair-1' });
  (releaseBluetoothDevice as jest.Mock).mockResolvedValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
});

it('shows devices found so far while the scan is still running', async () => {
  (pollBluetoothScan as jest.Mock).mockResolvedValue({
    status: 'pending', request_id: 'scan-1', progress: 'scanning', devices: [headphones],
  });
  const utils = renderIt();
  await act(async () => {});
  await startSpeakerScan(utils);

  await tick(1000);

  expect(utils.getByText('WH-1000XM4')).toBeTruthy();
  expect(utils.getByText(/Scanning… 1 found/)).toBeTruthy();
});

it('pairs a device tapped mid-scan and keeps the scan polling', async () => {
  (pollBluetoothScan as jest.Mock).mockResolvedValue({
    status: 'pending', request_id: 'scan-1', devices: [headphones],
  });
  const utils = renderIt();
  await act(async () => {});
  await startSpeakerScan(utils);
  await tick(1000);

  await act(async () => {
    fireEvent.press(utils.getByText('WH-1000XM4'));
  });
  expect(pairBluetoothDevice).toHaveBeenCalledWith('n1', headphones.mac_address, 'source');

  const scanPolls = (pollBluetoothScan as jest.Mock).mock.calls.length;
  (pollBluetoothScan as jest.Mock).mockResolvedValue({
    status: 'pending', request_id: 'scan-1', devices: [headphones, speaker],
  });
  await tick(2000);

  expect((pollBluetoothScan as jest.Mock).mock.calls.length).toBeGreaterThan(scanPolls);
  expect(pollBluetoothPair).toHaveBeenCalledWith('n1', 'pair-1');
  // The list stays up (no full-screen pairing spinner) and keeps growing.
  expect(utils.getByText('Kitchen Speaker')).toBeTruthy();
});

it('reloads Saved devices when the scan completes', async () => {
  (pollBluetoothScan as jest.Mock).mockResolvedValue({
    status: 'completed', request_id: 'scan-1', devices: [headphones],
  });
  const utils = renderIt();
  await act(async () => {});
  expect(getBluetoothStatus).toHaveBeenCalledTimes(1);
  await startSpeakerScan(utils);

  await tick(1000);

  expect(getBluetoothStatus).toHaveBeenCalledTimes(2);
  expect(utils.getByText(/1 device found/)).toBeTruthy();
});

it('does not offer pairing for a scanned device that is already saved', async () => {
  (getBluetoothStatus as jest.Mock).mockResolvedValue({
    available: true, connected: [], paired: [{ ...headphones, paired: true }],
  });
  (pollBluetoothScan as jest.Mock).mockResolvedValue({
    status: 'pending', request_id: 'scan-1', devices: [{ ...headphones, paired: true }, speaker],
  });
  const utils = renderIt();
  await act(async () => {});
  await startSpeakerScan(utils);
  await tick(1000);

  // Shown once, under Saved devices (with Forget); not as a pairable scan row.
  expect(utils.getAllByText('WH-1000XM4')).toHaveLength(1);
  expect(utils.getByText('Forget')).toBeTruthy();
  expect(utils.getByText('Kitchen Speaker')).toBeTruthy();
});

it('reloads Saved devices after a pair fails', async () => {
  (pollBluetoothScan as jest.Mock).mockResolvedValue({
    status: 'completed', request_id: 'scan-1', devices: [headphones],
  });
  (pollBluetoothPair as jest.Mock).mockResolvedValue({
    status: 'failed', request_id: 'pair-1', error_message: 'Page timeout',
  });
  const utils = renderIt();
  await act(async () => {});
  await startSpeakerScan(utils);
  await tick(1000);
  const before = (getBluetoothStatus as jest.Mock).mock.calls.length;

  await act(async () => {
    fireEvent.press(utils.getByText('WH-1000XM4'));
  });
  await tick(1000);

  expect(utils.getByText('Page timeout')).toBeTruthy();
  expect((getBluetoothStatus as jest.Mock).mock.calls.length).toBeGreaterThan(before);
});

it('reloads Saved devices again after a forget lands on the node', async () => {
  (getBluetoothStatus as jest.Mock).mockResolvedValue({
    available: true, connected: [], paired: [{ ...headphones, paired: true }],
  });
  const utils = renderIt();
  await act(async () => {});

  fireEvent.press(utils.getByText('Forget'));
  const forgetButtons = utils.getAllByText('Forget');
  await act(async () => {
    fireEvent.press(forgetButtons[forgetButtons.length - 1]);
  });
  expect(releaseBluetoothDevice).toHaveBeenCalledWith('n1', headphones.mac_address, true);
  const afterConfirm = (getBluetoothStatus as jest.Mock).mock.calls.length;

  // Forget is fire-and-forget on the node, so the immediate reload can read the old
  // state: the section reloads again a little later.
  await tick(5000);
  expect((getBluetoothStatus as jest.Mock).mock.calls.length).toBeGreaterThan(afterConfirm);
});
