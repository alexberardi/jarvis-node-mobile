import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import InboxCallbackResultScreen from '../../src/screens/Inbox/InboxCallbackResultScreen';
import { lightTheme } from '../../src/theme';

// L1 FLOW INTEGRATION — the stacked callback-result screen, driven against the
// REAL screen + real useState/poll loop. The screen mounts, fires
// getInteractiveCallbackStatus(jobId) on a setTimeout-rescheduled loop, and
// transitions pending -> terminal. We mock ONLY the leaf modules per the recon
// (nav hooks, the markdown display, and the single status API fn). We prove:
//   1. the pending -> completed transition (chained mock) renders the result,
//   2. completed pulls title/body/chip out of context_data.inbox,
//   3. a terminal `failed` status surfaces error_message,
//   4. an API throw shows the error-message, and Retry re-polls to success,
//   5. the back-button calls navigation.goBack(),
//   6. the 30s give-up path (the ONE fake-timer case) shows the timeout copy.
// Real timers everywhere except #6; the poll interval is ~1s so the happy
// cases take a couple seconds — acceptable, and the loop is allowed to reach
// a terminal status before each test ends so no setTimeout lingers.

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

const mockNavigation = {
  navigate: mockNavigate,
  goBack: mockGoBack,
};

let mockRouteParams: Record<string, unknown> = { jobId: 'job-1' };

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => ({ params: mockRouteParams }),
}));

// Markdown stub: passthrough so the body text is queryable (per InboxDetailScreen.test.tsx).
jest.mock('react-native-markdown-display', () => {
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ children }: any) => <Text>{children}</Text>,
  };
});

const mockGetInteractiveCallbackStatus = jest.fn();
jest.mock('../../src/api/commandCenterApi', () => ({
  getInteractiveCallbackStatus: (...args: any[]) =>
    mockGetInteractiveCallbackStatus(...args),
}));

// The child interactive section talks to its own API; keep it inert so a
// completed result with elements renders without a real round-trip.
jest.mock('../../src/components/InteractiveElementsSection', () => {
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: () => <Text testID="interactive-elements-stub">elements</Text>,
  };
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PaperProvider theme={lightTheme}>{children}</PaperProvider>
);

const pending = () => ({
  id: 'job-1',
  status: 'pending' as const,
  navigation_type: 'stack',
  completed_at: null,
  error_message: null,
  context_data: null,
});

const completed = (inbox: Record<string, unknown>) => ({
  id: 'job-1',
  status: 'completed' as const,
  navigation_type: 'stack',
  completed_at: '2026-06-10T10:31:02Z',
  error_message: null,
  context_data: { inbox },
});

const failed = (errorMessage: string) => ({
  id: 'job-1',
  status: 'failed' as const,
  navigation_type: 'stack',
  completed_at: '2026-06-10T10:31:02Z',
  error_message: errorMessage,
  context_data: null,
});

describe('InboxCallbackResult — flow integration (poll, terminal render, error, retry, back, timeout)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouteParams = { jobId: 'job-1', title: 'Cast details' };
  });

  it('polls pending then completed and renders the result body once terminal', async () => {
    // First tick pending, second tick completed — proves the transition + that
    // the loop re-schedules and stops once terminal.
    mockGetInteractiveCallbackStatus
      .mockResolvedValueOnce(pending())
      .mockResolvedValue(
        completed({
          title: 'Tom Hanks',
          summary: 'as Forrest Gump',
          body: 'Filmography body.',
          metadata: { content_format: 'markdown' },
        }),
      );

    const { getByTestId } = render(<InboxCallbackResultScreen />, { wrapper });

    // While pending, the spinner is up.
    expect(getByTestId('pending-indicator')).toBeTruthy();

    // After the poll resolves terminal, the result heading + body land.
    await waitFor(() => expect(getByTestId('result-heading')).toBeTruthy(), {
      timeout: 8000,
    });
    expect(getByTestId('result-heading').props.children).toBe('Tom Hanks');
    expect(getByTestId('result-body')).toBeTruthy();
    expect(getByTestId('status-chip')).toBeTruthy();

    // Called with the route's jobId; transitioned through at least two ticks.
    expect(mockGetInteractiveCallbackStatus).toHaveBeenCalledWith('job-1');
    expect(mockGetInteractiveCallbackStatus.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('completed status pulls title/body from context_data.inbox', async () => {
    mockGetInteractiveCallbackStatus.mockResolvedValue(
      completed({
        title: 'Result title',
        body: 'The rendered body text.',
        metadata: { content_format: 'markdown' },
      }),
    );

    const { getByTestId, getByText } = render(<InboxCallbackResultScreen />, {
      wrapper,
    });

    await waitFor(() => expect(getByTestId('result-heading')).toBeTruthy(), {
      timeout: 8000,
    });
    expect(getByTestId('result-heading').props.children).toBe('Result title');
    expect(getByText('The rendered body text.')).toBeTruthy();
    // No pending spinner remains once terminal.
    expect(() => getByTestId('pending-indicator')).toThrow();
  });

  it('renders error_message on a terminal failed status', async () => {
    mockGetInteractiveCallbackStatus.mockResolvedValue(
      failed('Node refused the request.'),
    );

    const { getByTestId } = render(<InboxCallbackResultScreen />, { wrapper });

    await waitFor(() => expect(getByTestId('error-message')).toBeTruthy(), {
      timeout: 8000,
    });
    expect(getByTestId('error-message').props.children).toBe(
      'Node refused the request.',
    );
  });

  it('shows the error on an API throw and Retry re-polls to a completed result', async () => {
    // First poll rejects -> error state. Retry then succeeds.
    mockGetInteractiveCallbackStatus
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValue(
        completed({ title: 'Recovered', body: 'ok', metadata: {} }),
      );

    const { getByTestId } = render(<InboxCallbackResultScreen />, { wrapper });

    // Error surfaces with the thrown message.
    await waitFor(() => expect(getByTestId('error-message')).toBeTruthy(), {
      timeout: 8000,
    });
    expect(getByTestId('error-message').props.children).toBe('network down');

    const callsBeforeRetry = mockGetInteractiveCallbackStatus.mock.calls.length;

    await act(async () => {
      fireEvent.press(getByTestId('retry-button'));
    });

    // Retry clears the error and re-polls to the completed result.
    await waitFor(() => expect(getByTestId('result-heading')).toBeTruthy(), {
      timeout: 8000,
    });
    expect(getByTestId('result-heading').props.children).toBe('Recovered');
    expect(mockGetInteractiveCallbackStatus.mock.calls.length).toBeGreaterThan(
      callsBeforeRetry,
    );
  });

  it('back button calls navigation.goBack()', async () => {
    // Land on a terminal state so nothing is left polling.
    mockGetInteractiveCallbackStatus.mockResolvedValue(
      completed({ title: 'Done', body: 'body', metadata: {} }),
    );

    const { getByTestId } = render(<InboxCallbackResultScreen />, { wrapper });
    await waitFor(() => expect(getByTestId('result-heading')).toBeTruthy(), {
      timeout: 8000,
    });

    fireEvent.press(getByTestId('back-button'));
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('gives up with the timeout copy after the 30s poll window (fake timers)', async () => {
    // Status stays pending forever; after POLL_TIMEOUT_MS (30s) of pending ticks
    // the screen sets the timeout error. This is the ONE fake-timer case.
    jest.useFakeTimers();
    mockGetInteractiveCallbackStatus.mockResolvedValue(pending());

    try {
      const { getByTestId } = render(<InboxCallbackResultScreen />, { wrapper });

      // Flush the initial poll + advance well past the 30s window so a later
      // pending tick observes the elapsed deadline. advanceTimersByTimeAsync
      // drains the awaited status promise between each rescheduled setTimeout.
      await act(async () => {
        await jest.advanceTimersByTimeAsync(35_000);
      });

      expect(getByTestId('error-message').props.children).toBe(
        'Timed out waiting for the result.',
      );
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });
});
