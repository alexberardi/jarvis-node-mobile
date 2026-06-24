import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import { HardwareTab } from '../../src/screens/Nodes/HardwareTab';
import { lightTheme } from '../../src/theme';
import { getVoiceProfileStatus } from '../../src/api/voiceProfileApi';
import * as Clipboard from 'expo-clipboard';

// L1 FLOW INTEGRATION — the node HardwareTab (no prior coverage). HardwareTab
// is a TAB rendered with PROPS (nodeId + node); it owns three pieces of logic
// of its own: (1) the on-mount voice-profile check that drives the enrollment
// copy + button label/mode ("Enroll Voice"/contained vs "Manage Profile"/
// outlined), with the in-flight "Checking…" state and the catch→null fallback;
// (2) the Voice-Recognition button navigating to the VoiceProfile screen; and
// (3) the Node-ID copy IconButton writing nodeId to the clipboard. The heavy
// child sections (Bluetooth / NodeVoiceSettings / NodeMaintenanceSettings /
// SpeakerHATCard) pull in native slider + datetimepicker + their own polling
// apis, so they're stubbed to null — this exercises HardwareTab's OWN logic
// only. Real screen + real state; only the child sections, help leaf, nav,
// auth, voiceProfileApi, and expo-clipboard are mocked. No timers: the screen
// has no poll loop of its own; the only setTimeout is the 2s copied-icon reset
// which we deliberately do not drive.

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

// Auth context — the active household id feeds getVoiceProfileStatus.
let mockHouseholdId: string | null = 'household-1';
jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: () => ({ state: { activeHouseholdId: mockHouseholdId } }),
}));

// The heavy native-backed child sections — stub to null so we test only
// HardwareTab's own card logic (no slider / datetimepicker / child polling).
jest.mock('../../src/components/BluetoothSection', () => ({
  BluetoothSection: () => null,
}));
jest.mock('../../src/components/NodeVoiceSettings', () => ({
  NodeVoiceSettings: () => null,
}));
jest.mock('../../src/components/NodeMaintenanceSettings', () => ({
  NodeMaintenanceSettings: () => null,
}));
jest.mock('../../src/components/SpeakerHATCard', () => ({
  SpeakerHATCard: () => null,
}));

// Help leaf is context-backed — stub both exports the screen uses.
jest.mock('../../src/components/HelpIcon', () => ({
  HelpIcon: () => null,
  InfoHelperText: () => null,
}));

jest.mock('../../src/api/voiceProfileApi', () => ({
  getVoiceProfileStatus: jest.fn(),
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn().mockResolvedValue(undefined),
}));

const NODE_ID = 'node-abc-123';

// Minimal NodeInfo — only the fields HardwareTab's Device-Info card reads.
const baseNode: any = {
  node_id: NODE_ID,
  voice_mode: 'brief',
  platform: 'linux/arm64',
  python_version: '3.11.2',
  adapter_hash: null,
};

const renderTab = (node: any = baseNode, nodeId: string = NODE_ID) =>
  render(
    <PaperProvider theme={lightTheme}>
      <HardwareTab nodeId={nodeId} node={node} />
    </PaperProvider>,
  );

describe('HardwareTab — flow integration (voice-profile check, enroll nav, copy id)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHouseholdId = 'household-1';
    (getVoiceProfileStatus as jest.Mock).mockResolvedValue({
      has_profile: false,
      sample_count: 0,
    });
    (Clipboard.setStringAsync as jest.Mock).mockResolvedValue(undefined);
  });

  it('checks the voice profile on mount and shows the un-enrolled state (Enroll Voice / contained)', async () => {
    const { getByText, getByTestId } = renderTab();

    // The mount-time check fires with the active household id.
    await waitFor(() =>
      expect(getVoiceProfileStatus).toHaveBeenCalledWith('household-1'),
    );
    expect(getVoiceProfileStatus).toHaveBeenCalledTimes(1);

    // No profile → un-enrolled copy + the contained "Enroll Voice" CTA.
    await waitFor(() =>
      expect(
        getByText('No voice profile yet. Enroll so Jarvis can identify you.'),
      ).toBeTruthy(),
    );
    // Button content carries the leading icon glyph → match the label as a substring.
    expect(getByTestId('voice-recognition-enroll-btn')).toHaveTextContent(
      /Enroll Voice/,
    );
  });

  it('shows the enrolled state (Manage Profile) when a profile already exists', async () => {
    (getVoiceProfileStatus as jest.Mock).mockResolvedValue({
      has_profile: true,
      sample_count: 3,
    });

    const { getByText, getByTestId } = renderTab();

    await waitFor(() =>
      expect(
        getByText('Voice profile enrolled. Jarvis can identify you.'),
      ).toBeTruthy(),
    );
    expect(getByTestId('voice-recognition-enroll-btn')).toHaveTextContent(
      /Manage Profile/,
    );
  });

  it('keeps the "Checking…" state when the status fetch fails (catch → null)', async () => {
    (getVoiceProfileStatus as jest.Mock).mockRejectedValueOnce(
      new Error('whisper down'),
    );

    const { getByText, getByTestId } = renderTab();

    await waitFor(() => expect(getVoiceProfileStatus).toHaveBeenCalled());

    // hasVoiceProfile stays null → the "Checking…" copy persists, and the
    // button stays in its default un-enrolled "Enroll Voice" label.
    await waitFor(() =>
      expect(getByText('Checking enrollment status...')).toBeTruthy(),
    );
    expect(getByTestId('voice-recognition-enroll-btn')).toHaveTextContent(
      /Enroll Voice/,
    );
  });

  it('the Voice-Recognition button navigates to the VoiceProfile screen', async () => {
    const { getByTestId } = renderTab();

    await waitFor(() => expect(getVoiceProfileStatus).toHaveBeenCalled());

    await act(async () => {
      fireEvent.press(getByTestId('voice-recognition-enroll-btn'));
    });

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('VoiceProfile');
  });

  it('the copy IconButton writes the node id to the clipboard', async () => {
    const { getByTestId } = renderTab(baseNode, NODE_ID);

    await waitFor(() => expect(getVoiceProfileStatus).toHaveBeenCalled());

    // The copy handler also schedules a 2s setTimeout to reset the icon; switch
    // to fake timers around the press so we can flush it and not leak a timer.
    jest.useFakeTimers();
    try {
      await act(async () => {
        fireEvent.press(getByTestId('node-id-copy-btn'));
      });

      expect(Clipboard.setStringAsync).toHaveBeenCalledTimes(1);
      expect(Clipboard.setStringAsync).toHaveBeenCalledWith(NODE_ID);

      // Drain the copied-icon reset timer so nothing lingers past the test.
      await act(async () => {
        jest.advanceTimersByTime(2000);
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('skips the status check entirely when there is no active household', async () => {
    mockHouseholdId = null;

    const { getByText } = renderTab();

    // No household → checkVoiceProfile early-returns, status never fetched,
    // and the copy stays in the un-fetched "Checking…" state.
    expect(getVoiceProfileStatus).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(getByText('Checking enrollment status...')).toBeTruthy(),
    );
  });
});
