/**
 * usePresence — the foreground presence lifecycle (Phase 3 additions).
 *
 * Pins the two load-bearing behaviours the review flagged as untested:
 *  - on a sync (login / resume) the deferred queue is FLUSHED before the live
 *    sample runs (flushed edges must write last-state before the sample reads
 *    it), and
 *  - the OS geofence is RE-ARMED on each sync (Android reboot / Location toggle
 *    clears it).
 */
jest.mock('../../src/auth/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../src/services/backgroundPresenceTask', () => ({
  rearmIfNeeded: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/services/presenceService', () => ({
  reportIfChanged: jest.fn().mockResolvedValue({ status: 'unchanged', state: 'home' }),
  flushPendingQueue: jest.fn().mockResolvedValue(undefined),
  clearLastPresenceState: jest.fn().mockResolvedValue(undefined),
  REFRESH_AFTER_MS: 90 * 60 * 1000,
}));

import { renderHook, act } from '@testing-library/react-native';

import { useAuth } from '../../src/auth/AuthContext';
import { usePresence } from '../../src/hooks/usePresence';
import { rearmIfNeeded } from '../../src/services/backgroundPresenceTask';
import { flushPendingQueue, reportIfChanged } from '../../src/services/presenceService';

const authed = {
  state: {
    isAuthenticated: true,
    activeHouseholdId: 'hh1',
    user: { id: 7, username: 'Alex' },
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  (useAuth as jest.Mock).mockReturnValue(authed);
  (flushPendingQueue as jest.Mock).mockResolvedValue(undefined);
  (reportIfChanged as jest.Mock).mockResolvedValue({ status: 'unchanged', state: 'home' });
});

it('flushes the deferred queue BEFORE the live sample, and re-arms the geofence', async () => {
  // Hold the flush open so we can prove the sample waits for it.
  let releaseFlush!: () => void;
  (flushPendingQueue as jest.Mock).mockReturnValue(
    new Promise<void>((resolve) => {
      releaseFlush = resolve;
    }),
  );

  const { unmount } = renderHook(() => usePresence());

  // Sync fires on mount: flush + rearm start immediately, sample is gated.
  expect(flushPendingQueue).toHaveBeenCalledWith('hh1', 7, 'Alex');
  expect(rearmIfNeeded).toHaveBeenCalled();
  expect(reportIfChanged).not.toHaveBeenCalled();

  await act(async () => {
    releaseFlush();
    await Promise.resolve();
  });

  expect(reportIfChanged).toHaveBeenCalledWith('hh1', 7, 'Alex');
  unmount();
});

it('does nothing when unauthenticated', () => {
  (useAuth as jest.Mock).mockReturnValue({
    state: { isAuthenticated: false, activeHouseholdId: null, user: null },
  });

  const { unmount } = renderHook(() => usePresence());

  expect(flushPendingQueue).not.toHaveBeenCalled();
  expect(rearmIfNeeded).not.toHaveBeenCalled();
  expect(reportIfChanged).not.toHaveBeenCalled();
  unmount();
});
