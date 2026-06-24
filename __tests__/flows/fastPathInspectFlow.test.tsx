import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import FastPathInspectScreen from '../../src/screens/Nodes/FastPathInspectScreen';
import { lightTheme } from '../../src/theme';
import { encryptAndPushConfig } from '../../src/services/configPushService';

// L1 FLOW INTEGRATION — the per-pattern fast-path toggle screen (no prior
// coverage). Route params carry the commands as JSON (no mount load); each
// Switch flip optimistically updates local state and pushes an encrypted
// fast_path_registry config to the node via encryptAndPushConfig(nodeId,
// 'fast_path_registry', { command_name, pattern_id, enabled }). We assert: the
// rows render from the serialized params, the enable/disable push arg shapes,
// the optimistic rollback + error Snackbar when the push rejects, the
// pending-disable on the Switch during an in-flight push, and the back action.
// Real screen + real useState; only the crypto-wrapping config-push service and
// the nav/route hooks are mocked (NO native crypto / k2Service runs).

const mockGoBack = jest.fn();
let mockRouteParams: any;
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: mockGoBack }),
  useRoute: () => ({ params: mockRouteParams }),
}));

jest.mock('../../src/services/configPushService', () => ({
  encryptAndPushConfig: jest.fn(),
}));

const pushConfig = encryptAndPushConfig as jest.Mock;

const NODE_ID = 'node-abc';

// Two commands, each with fast-path patterns. weather.current starts enabled,
// weather.forecast starts disabled, timer.set starts enabled.
const COMMANDS = [
  {
    command_name: 'get_weather',
    fast_paths: [
      {
        id: 'weather.current',
        description: 'Current conditions',
        example: "what's the weather",
        enabled: true,
      },
      {
        id: 'weather.forecast',
        description: 'Forecast lookups',
        example: 'forecast for tomorrow',
        enabled: false,
      },
    ],
  },
  {
    command_name: 'set_timer',
    fast_paths: [
      {
        id: 'timer.set',
        description: 'Start a timer',
        example: 'set a 5 minute timer',
        enabled: true,
      },
    ],
  },
];

const makeParams = (commands: any[] = COMMANDS) => ({
  nodeId: NODE_ID,
  groupName: 'Weather & Timers',
  commandsJson: JSON.stringify(commands),
});

const renderScreen = () =>
  render(
    <PaperProvider theme={lightTheme}>
      <FastPathInspectScreen />
    </PaperProvider>,
  );

describe('Fast-path inspect — flow integration (render, toggle push, rollback, pending, back)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouteParams = makeParams();
    pushConfig.mockResolvedValue(undefined);
  });

  it('renders a section + switch per (command, pattern) from the serialized params, seeded with the inbound enabled flag', () => {
    const { getByTestId } = renderScreen();

    // One section per command.
    expect(getByTestId('cmd-get_weather')).toBeTruthy();
    expect(getByTestId('cmd-set_timer')).toBeTruthy();

    // One switch per pattern, seeded from the param `enabled`.
    expect(
      getByTestId('switch-get_weather::weather.current').props.value,
    ).toBe(true);
    expect(
      getByTestId('switch-get_weather::weather.forecast').props.value,
    ).toBe(false);
    expect(getByTestId('switch-set_timer::timer.set').props.value).toBe(true);

    // No load on mount — nothing is pushed just by rendering.
    expect(pushConfig).not.toHaveBeenCalled();
  });

  it('disabling an enabled pattern pushes enabled:"false" with the command/pattern arg shape and flips the switch optimistically', async () => {
    const { getByTestId } = renderScreen();

    await act(async () => {
      fireEvent(
        getByTestId('switch-get_weather::weather.current'),
        'valueChange',
        false,
      );
    });

    expect(pushConfig).toHaveBeenCalledTimes(1);
    expect(pushConfig).toHaveBeenCalledWith(NODE_ID, 'fast_path_registry', {
      command_name: 'get_weather',
      pattern_id: 'weather.current',
      enabled: 'false',
    });

    // Optimistic flip persists after a successful push.
    await waitFor(() =>
      expect(
        getByTestId('switch-get_weather::weather.current').props.value,
      ).toBe(false),
    );
  });

  it('enabling a disabled pattern pushes enabled:"true" for that exact pattern only', async () => {
    const { getByTestId } = renderScreen();

    await act(async () => {
      fireEvent(
        getByTestId('switch-get_weather::weather.forecast'),
        'valueChange',
        true,
      );
    });

    expect(pushConfig).toHaveBeenCalledTimes(1);
    expect(pushConfig).toHaveBeenCalledWith(NODE_ID, 'fast_path_registry', {
      command_name: 'get_weather',
      pattern_id: 'weather.forecast',
      enabled: 'true',
    });

    await waitFor(() =>
      expect(
        getByTestId('switch-get_weather::weather.forecast').props.value,
      ).toBe(true),
    );
    // A different pattern's switch is untouched.
    expect(getByTestId('switch-set_timer::timer.set').props.value).toBe(true);
  });

  it('on push failure the switch rolls back to its prior value and the error Snackbar surfaces the message', async () => {
    pushConfig.mockRejectedValueOnce(new Error('node offline'));
    const { getByTestId, findByText } = renderScreen();

    await act(async () => {
      fireEvent(
        getByTestId('switch-set_timer::timer.set'),
        'valueChange',
        false,
      );
    });

    // Push was attempted with the disable payload...
    expect(pushConfig).toHaveBeenCalledWith(NODE_ID, 'fast_path_registry', {
      command_name: 'set_timer',
      pattern_id: 'timer.set',
      enabled: 'false',
    });

    // ...but it failed, so the optimistic flip is rolled back to the original.
    await waitFor(() =>
      expect(getByTestId('switch-set_timer::timer.set').props.value).toBe(true),
    );

    // Error Snackbar surfaces the underlying message.
    await findByText('Failed to update pattern: node offline');
  });

  it('the Switch is disabled while a push is in flight, then re-enabled once it resolves', async () => {
    // Deferred push so the toggle stays pending until we resolve it.
    let resolvePush!: () => void;
    pushConfig.mockReturnValueOnce(
      new Promise<void>((res) => {
        resolvePush = res;
      }),
    );

    const { getByTestId } = renderScreen();

    act(() => {
      fireEvent(
        getByTestId('switch-get_weather::weather.current'),
        'valueChange',
        false,
      );
    });

    // While in flight: switch is disabled (pendingKeys holds this key).
    await waitFor(() =>
      expect(
        getByTestId('switch-get_weather::weather.current').props.disabled,
      ).toBe(true),
    );

    // Resolve the push → pending clears → switch re-enabled.
    await act(async () => {
      resolvePush();
    });

    await waitFor(() =>
      expect(
        getByTestId('switch-get_weather::weather.current').props.disabled,
      ).toBe(false),
    );
  });

  it('the Appbar back action calls navigation.goBack()', () => {
    const { getByTestId } = renderScreen();
    fireEvent.press(getByTestId('appbar-back'));
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });
});
