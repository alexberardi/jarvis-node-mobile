import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import CoverControl from '../../src/components/device-controls/CoverControl';
import { lightTheme } from '../../src/theme';
import { controlDevice } from '../../src/api/smartHomeApi';
import type { DeviceState } from '../../src/types/SmartHome';

jest.mock('../../src/api/smartHomeApi', () => ({
  controlDevice: jest.fn(),
}));

const mockedControl = controlDevice as jest.MockedFunction<typeof controlDevice>;

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PaperProvider theme={lightTheme}>{children}</PaperProvider>
);

const makeState = (overrides: Partial<DeviceState> = {}): DeviceState => ({
  entity_id: 'cover.garage_door',
  domain: 'cover',
  state: null,
  ui_hints: null,
  error: null,
  ...overrides,
});

describe('CoverControl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedControl.mockResolvedValue({
      success: true,
      entity_id: 'cover.garage_door',
      action: 'open_cover',
      error: null,
    });
  });

  it('renders Open, Stop, and Close buttons', () => {
    const state = makeState({ state: null });
    const { getByText } = render(
      <CoverControl
        householdId="hh-1"
        deviceId="dev-1"
        state={state}
        onStateChange={jest.fn()}
      />,
      { wrapper },
    );
    expect(getByText('Open')).toBeTruthy();
    expect(getByText('Stop')).toBeTruthy();
    expect(getByText('Close')).toBeTruthy();
  });

  it('shows state text when live state is available', () => {
    const state = makeState({ state: { state: 'closed' } });
    const { getByText } = render(
      <CoverControl
        householdId="hh-1"
        deviceId="dev-1"
        state={state}
        onStateChange={jest.fn()}
      />,
      { wrapper },
    );
    // State is capitalized: "closed" -> "Closed"
    // Using "Closed" avoids collision with the "Close" button text
    expect(getByText('Closed')).toBeTruthy();
  });

  it('shows position percentage when available', () => {
    const state = makeState({ state: { state: 'open', position: 75 } });
    const { getByText } = render(
      <CoverControl
        householdId="hh-1"
        deviceId="dev-1"
        state={state}
        onStateChange={jest.fn()}
      />,
      { wrapper },
    );
    expect(getByText('75% open')).toBeTruthy();
  });

  it('calls controlDevice with open_cover when Open is pressed', async () => {
    const onStateChange = jest.fn();
    const state = makeState({ state: null });
    const { getByText } = render(
      <CoverControl
        householdId="hh-1"
        deviceId="dev-1"
        state={state}
        onStateChange={onStateChange}
      />,
      { wrapper },
    );

    fireEvent.press(getByText('Open'));

    await waitFor(() => {
      expect(mockedControl).toHaveBeenCalledWith('hh-1', 'dev-1', 'open_cover');
    });

    await waitFor(() => {
      expect(onStateChange).toHaveBeenCalled();
    });
  });

  it('calls controlDevice with close_cover when Close is pressed', async () => {
    const state = makeState({ state: null });
    const { getByText } = render(
      <CoverControl
        householdId="hh-1"
        deviceId="dev-1"
        state={state}
        onStateChange={jest.fn()}
      />,
      { wrapper },
    );

    fireEvent.press(getByText('Close'));

    await waitFor(() => {
      expect(mockedControl).toHaveBeenCalledWith('hh-1', 'dev-1', 'close_cover');
    });
  });

  it('calls controlDevice with stop_cover when Stop is pressed', async () => {
    const state = makeState({ state: null });
    const { getByText } = render(
      <CoverControl
        householdId="hh-1"
        deviceId="dev-1"
        state={state}
        onStateChange={jest.fn()}
      />,
      { wrapper },
    );

    fireEvent.press(getByText('Stop'));

    await waitFor(() => {
      expect(mockedControl).toHaveBeenCalledWith('hh-1', 'dev-1', 'stop_cover');
    });
  });

  it('does not show state/position row when no live state', () => {
    const state = makeState({ state: null });
    const { queryByText } = render(
      <CoverControl
        householdId="hh-1"
        deviceId="dev-1"
        state={state}
        onStateChange={jest.fn()}
      />,
      { wrapper },
    );
    expect(queryByText('% open')).toBeNull();
  });
});
