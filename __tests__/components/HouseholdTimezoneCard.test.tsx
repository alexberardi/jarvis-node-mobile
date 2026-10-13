import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import HouseholdTimezoneCard, { timezoneSummary } from '../../src/components/HouseholdTimezoneCard';
import { getHouseholdTimezone, setHouseholdSetting } from '../../src/api/householdSettingsApi';
import * as tzUtils from '../../src/utils/timezones';
import { PaperWrapper } from '../testUtils';

// The household "Time zone" row (jarvisd household.timezone): Automatic shows
// the node-derived zone; the picker offers Automatic, the phone's zone and a
// searchable IANA list; Automatic writes ""; hidden against a server without
// the setting; read-only for non-admins.

jest.mock('../../src/api/householdSettingsApi', () => {
  const actual = jest.requireActual('../../src/api/householdSettingsApi');
  return {
    ...actual,
    setHouseholdSetting: jest.fn(() => Promise.resolve()),
    getHouseholdTimezone: jest.fn(() =>
      Promise.resolve({
        household_id: 'hh-1',
        timezone: 'America/New_York',
        source: 'node',
        node_timezone: 'America/New_York',
      }),
    ),
  };
});

const setSetting = setHouseholdSetting as jest.Mock;
const getInfo = getHouseholdTimezone as jest.Mock;

const renderCard = async (value: string | undefined, canEdit = true) => {
  const onChanged = jest.fn(() => Promise.resolve());
  const utils = render(
    <PaperWrapper>
      <HouseholdTimezoneCard householdId="hh-1" value={value} loading={false} canEdit={canEdit} onChanged={onChanged} />
    </PaperWrapper>,
  );
  await act(async () => {}); // let the best-effort zone fetch settle
  return { ...utils, onChanged };
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(tzUtils, 'deviceTimeZone').mockReturnValue('Europe/London');
});

afterEach(() => jest.restoreAllMocks());

describe('timezoneSummary', () => {
  const info = { household_id: 'h', timezone: '', source: 'default' as const, node_timezone: '' };
  it('names the chosen zone', () => {
    expect(timezoneSummary('Asia/Tokyo', info)).toBe('Asia/Tokyo');
  });
  it('shows what Automatic resolves to', () => {
    expect(timezoneSummary('', { ...info, node_timezone: 'America/New_York' })).toBe(
      'Automatic — America/New York (from your nodes)',
    );
    expect(timezoneSummary('', info)).toBe('Automatic — UTC until a node reports its time zone');
    expect(timezoneSummary('', null)).toBe('Automatic (from your nodes)');
  });
});

describe('HouseholdTimezoneCard', () => {
  it('renders nothing against a server without the setting', async () => {
    const { queryByTestId } = await renderCard(undefined);
    expect(queryByTestId('household-timezone-card')).toBeNull();
    expect(getInfo).not.toHaveBeenCalled();
  });

  it('shows the node-derived zone when automatic', async () => {
    const { findByText } = await renderCard('');
    expect(await findByText('Automatic — America/New York (from your nodes)')).toBeTruthy();
    expect(getInfo).toHaveBeenCalledWith('hh-1');
  });

  it('still works when the zone endpoint fails', async () => {
    getInfo.mockRejectedValueOnce(new Error('404'));
    const { findByText } = await renderCard('');
    expect(await findByText('Automatic (from your nodes)')).toBeTruthy();
  });

  it('is read-only for a non-admin', async () => {
    const { findByText, getByText, queryByText } = await renderCard('Asia/Tokyo', false);
    expect(await findByText('Asia/Tokyo')).toBeTruthy();
    expect(getByText('Only a household admin can change this.')).toBeTruthy();
    expect(queryByText('Change')).toBeNull();
    fireEvent.press(getByText('Asia/Tokyo'));
    expect(queryByText('Search time zones')).toBeNull();
  });

  it('searches and saves a zone', async () => {
    const { getByTestId, findByTestId, onChanged } = await renderCard('');
    await waitFor(() => expect(getInfo).toHaveBeenCalled());
    fireEvent.press(getByTestId('household-timezone-row'));
    fireEvent.changeText(await findByTestId('household-timezone-search'), 'tokyo');
    await act(async () => {
      fireEvent.press(await findByTestId('household-timezone-option-Asia/Tokyo'));
    });
    expect(setSetting).toHaveBeenCalledWith('hh-1', 'household.timezone', 'Asia/Tokyo');
    expect(onChanged).toHaveBeenCalled();
  });

  it("uses the phone's zone", async () => {
    const { getByTestId, findByTestId, findByText } = await renderCard('');
    fireEvent.press(getByTestId('household-timezone-row'));
    expect(await findByText('Europe/London')).toBeTruthy();
    await act(async () => {
      fireEvent.press(await findByTestId('household-timezone-phone'));
    });
    expect(setSetting).toHaveBeenCalledWith('hh-1', 'household.timezone', 'Europe/London');
  });

  it('Automatic clears the setting', async () => {
    const { getByTestId, findByTestId } = await renderCard('Asia/Tokyo');
    fireEvent.press(getByTestId('household-timezone-row'));
    await act(async () => {
      fireEvent.press(await findByTestId('household-timezone-automatic'));
    });
    expect(setSetting).toHaveBeenCalledWith('hh-1', 'household.timezone', '');
  });

  it("shows the server's error and keeps the dialog open", async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    setSetting.mockRejectedValueOnce({
      response: { data: { detail: "Invalid value for household.timezone: 'X' is not a known IANA time zone" } },
    });
    const { getByTestId, findByTestId, onChanged } = await renderCard('');
    fireEvent.press(getByTestId('household-timezone-row'));
    await act(async () => {
      fireEvent.press(await findByTestId('household-timezone-phone'));
    });
    expect(alert).toHaveBeenCalledWith('Error', "Invalid value for household.timezone: 'X' is not a known IANA time zone");
    expect(onChanged).not.toHaveBeenCalled();
    expect(getByTestId('household-timezone-search')).toBeTruthy();
  });
});
