import React from 'react';
import { render } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import CameraControl from '../../src/components/device-controls/CameraControl';
import { lightTheme } from '../../src/theme';
import type { DeviceState } from '../../src/types/SmartHome';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PaperProvider theme={lightTheme}>{children}</PaperProvider>
);

const makeState = (overrides: Partial<DeviceState> = {}): DeviceState => ({
  entity_id: 'camera.front_door',
  domain: 'camera',
  state: null,
  ui_hints: null,
  error: null,
  ...overrides,
});

describe('CameraControl', () => {
  it('shows "Online" chip when camera is online', () => {
    const state = makeState({ state: { online: true } });
    const { getByText } = render(
      <CameraControl state={state} />,
      { wrapper },
    );
    expect(getByText('Online')).toBeTruthy();
  });

  it('shows "Offline" chip when camera is offline', () => {
    const state = makeState({ state: { online: false } });
    const { getByText } = render(
      <CameraControl state={state} />,
      { wrapper },
    );
    expect(getByText('Offline')).toBeTruthy();
  });

  it('shows "Live stream not yet supported" text', () => {
    const state = makeState({ state: { online: true } });
    const { getByText } = render(
      <CameraControl state={state} />,
      { wrapper },
    );
    expect(getByText('Live stream not yet supported')).toBeTruthy();
  });

  it('defaults to offline when state is null', () => {
    const state = makeState({ state: null });
    const { getByText } = render(
      <CameraControl state={state} />,
      { wrapper },
    );
    expect(getByText('Offline')).toBeTruthy();
  });
});
