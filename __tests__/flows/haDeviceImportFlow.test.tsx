import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';

import HADeviceImportScreen from '../../src/screens/SmartHome/HADeviceImportScreen';
import { lightTheme } from '../../src/theme';
import { fetchEnrichedEntities } from '../../src/services/haApiService';
import { EnrichedEntity, HAArea } from '../../src/types/SmartHome';

// L1 FLOW INTEGRATION — the HA device-import picker (no prior coverage): the
// on-mount fetchEnrichedEntities(haUrl, haToken) load, domain filter-chip
// narrowing, per-entity toggle + select-all toggle for a filtered domain, the
// Import gate (button disabled when nothing selected) → navigate to
// DeviceRoomAssignment with the JSON-serialized selection + areas + source +
// creds, Back → goBack, and the error/Retry + loading states. Real screen +
// real local selection state; navigation/route come via props, only the
// haApiService leaf is mocked.

jest.mock('../../src/services/haApiService', () => ({
  fetchEnrichedEntities: jest.fn(),
}));

const HA_URL = 'http://homeassistant.local:8123';
const HA_TOKEN = 'llat-secret';

const AREAS: HAArea[] = [
  { area_id: 'kitchen', name: 'Kitchen', aliases: [], picture: null },
  { area_id: 'bedroom', name: 'Bedroom', aliases: [], picture: null },
];

const makeEntity = (over: Partial<EnrichedEntity>): EnrichedEntity => ({
  entity_id: 'light.kitchen',
  name: 'Kitchen Light',
  domain: 'light',
  device_class: null,
  manufacturer: null,
  model: null,
  ha_device_id: null,
  area_id: 'kitchen',
  area_name: 'Kitchen',
  state: 'on',
  selected: false,
  ...over,
});

// Two light domains + one switch, all starting DESELECTED so the gate + the
// individual/select-all toggles are exercised deterministically.
const LIGHT_A = makeEntity({ entity_id: 'light.kitchen', name: 'Kitchen Light', domain: 'light' });
const LIGHT_B = makeEntity({
  entity_id: 'light.bedroom',
  name: 'Bedroom Light',
  domain: 'light',
  area_id: 'bedroom',
  area_name: 'Bedroom',
});
const SWITCH_A = makeEntity({
  entity_id: 'switch.fan',
  name: 'Fan Switch',
  domain: 'switch',
  area_id: null,
  area_name: null,
  state: 'off',
});

const makeNav = () =>
  ({ navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn() }) as any;

const renderScreen = (nav = makeNav()) => {
  const utils = render(
    <PaperProvider theme={lightTheme}>
      <HADeviceImportScreen
        navigation={nav}
        route={
          {
            params: { haUrl: HA_URL, haToken: HA_TOKEN },
            key: 'k',
            name: 'HADeviceImport',
          } as any
        }
      />
    </PaperProvider>,
  );
  return { ...utils, nav };
};

describe('HA device import — flow integration (load, filter, toggle, import gate, errors)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetchEnrichedEntities as jest.Mock).mockResolvedValue({
      entities: [LIGHT_A, LIGHT_B, SWITCH_A],
      areas: AREAS,
    });
  });

  it('loads devices on mount with (haUrl, haToken) and renders the entity rows', async () => {
    const utils = renderScreen();

    await utils.findByText('Kitchen Light');
    expect(fetchEnrichedEntities).toHaveBeenCalledWith(HA_URL, HA_TOKEN);
    expect(fetchEnrichedEntities).toHaveBeenCalledTimes(1);
    expect(utils.getByText('Bedroom Light')).toBeTruthy();
    expect(utils.getByText('Fan Switch')).toBeTruthy();
    // 3 controllable devices found, 0 selected by default.
    expect(utils.getByText(/3 controllable devices found\. 0 selected\./)).toBeTruthy();
  });

  it('tapping a domain chip narrows the list to that domain', async () => {
    const utils = renderScreen();
    await utils.findByText('Kitchen Light');

    // All three visible before filtering.
    expect(utils.queryByTestId('entity-row-switch.fan')).toBeTruthy();

    await act(async () => {
      fireEvent.press(utils.getByTestId('chip-switch'));
    });

    // Only the switch row remains; the two light rows are filtered out.
    expect(utils.getByTestId('entity-row-switch.fan')).toBeTruthy();
    expect(utils.queryByTestId('entity-row-light.kitchen')).toBeNull();
    expect(utils.queryByTestId('entity-row-light.bedroom')).toBeNull();
  });

  it('select-all for a filtered domain selects every entity in it, then import navigates with that selection', async () => {
    const { getByTestId, findByText, nav } = renderScreen();
    await findByText('Kitchen Light');

    // Import is gated while nothing is selected.
    expect(getByTestId('import-button').props.accessibilityState?.disabled).toBe(true);

    // Filter to lights, then select-all toggles both lights on.
    await act(async () => {
      fireEvent.press(getByTestId('chip-light'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('select-all-toggle'));
    });

    // Switch was never selected — verify only the two lights flow through.
    expect(getByTestId('import-button').props.accessibilityState?.disabled).toBe(false);

    await act(async () => {
      fireEvent.press(getByTestId('import-button'));
    });

    expect(nav.navigate).toHaveBeenCalledTimes(1);
    const [target, params] = (nav.navigate as jest.Mock).mock.calls[0];
    expect(target).toBe('DeviceRoomAssignment');
    expect(params.source).toBe('home_assistant');
    expect(params.haUrl).toBe(HA_URL);
    expect(params.haToken).toBe(HA_TOKEN);
    expect(JSON.parse(params.areas)).toEqual(AREAS);

    const selected = JSON.parse(params.selectedDevices) as EnrichedEntity[];
    expect(selected.map((e) => e.entity_id).sort()).toEqual([
      'light.bedroom',
      'light.kitchen',
    ]);
    expect(selected.every((e) => e.selected)).toBe(true);
    // The switch must NOT be in the selection.
    expect(selected.some((e) => e.entity_id === 'switch.fan')).toBe(false);
  });

  it('a single row toggle + checkbox re-toggle gates the Import button on net selection count', async () => {
    const { getByTestId, findByText } = renderScreen();
    await findByText('Kitchen Light');

    expect(getByTestId('import-button').props.accessibilityState?.disabled).toBe(true);

    // Select one entity via its row → enabled.
    await act(async () => {
      fireEvent.press(getByTestId('entity-row-light.kitchen'));
    });
    expect(getByTestId('import-button').props.accessibilityState?.disabled).toBe(false);
    expect(getByTestId('checkbox-light.kitchen').props.accessibilityState?.checked).toBe(true);

    // Deselect it via the checkbox → back to disabled.
    await act(async () => {
      fireEvent.press(getByTestId('checkbox-light.kitchen'));
    });
    expect(getByTestId('import-button').props.accessibilityState?.disabled).toBe(true);
  });

  it('Back button calls navigation.goBack', async () => {
    const { getByTestId, findByText, nav } = renderScreen();
    await findByText('Kitchen Light');

    fireEvent.press(getByTestId('back-button'));
    expect(nav.goBack).toHaveBeenCalledTimes(1);
    expect(nav.navigate).not.toHaveBeenCalled();
  });

  it('shows the error + Retry on load failure, then Retry re-fetches and renders devices', async () => {
    (fetchEnrichedEntities as jest.Mock).mockRejectedValueOnce(
      new Error('Failed to fetch devices: HTTP 401'),
    );
    const utils = renderScreen();

    await utils.findByText('Failed to fetch devices: HTTP 401');
    expect(utils.queryByTestId('entity-row-light.kitchen')).toBeNull();

    // Retry — the rejected mock was once-only, so the next call resolves.
    await act(async () => {
      fireEvent.press(utils.getByTestId('retry-button'));
    });

    await utils.findByText('Kitchen Light');
    expect(fetchEnrichedEntities).toHaveBeenCalledTimes(2);
  });
});
