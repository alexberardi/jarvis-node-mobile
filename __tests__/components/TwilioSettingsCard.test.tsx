import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';

import TwilioSettingsCard, {
  isE164,
  normalizePhoneNumber,
  twilioStateFromSettings,
  type TwilioState,
} from '../../src/components/TwilioSettingsCard';
import { setHouseholdSetting } from '../../src/api/householdSettingsApi';
import { PaperWrapper } from '../testUtils';

// The household's own Twilio account (jarvisd AD6). Write-only: the card shows
// whether the SID/token are set, never their values; saves must leave a whole
// account (the server refuses a call from a partial set); Remove clears all three.

jest.mock('../../src/api/householdSettingsApi', () => {
  const actual = jest.requireActual('../../src/api/householdSettingsApi');
  return { ...actual, setHouseholdSetting: jest.fn(() => Promise.resolve()) };
});

const setSetting = setHouseholdSetting as jest.Mock;

const NONE: TwilioState = { sidSet: false, tokenSet: false, fromNumber: null };
const ALL: TwilioState = { sidSet: true, tokenSet: true, fromNumber: '+15551234567' };

const renderCard = (state: TwilioState, canEdit = true) => {
  const onChanged = jest.fn(() => Promise.resolve());
  const utils = render(
    <PaperWrapper>
      <TwilioSettingsCard householdId="hh-1" state={state} loading={false} canEdit={canEdit} onChanged={onChanged} />
    </PaperWrapper>,
  );
  return { ...utils, onChanged };
};

describe('twilio helpers', () => {
  it('maps the masked GET values to set/not set and never keeps the secret', () => {
    expect(
      twilioStateFromSettings({
        'phone.twilio_account_sid': '********',
        'phone.twilio_auth_token': null,
        'phone.twilio_from_number': '+15551234567',
      }),
    ).toEqual({ sidSet: true, tokenSet: false, fromNumber: '+15551234567' });
    expect(twilioStateFromSettings({})).toEqual(NONE);
  });

  it('matches the server E.164 rule', () => {
    expect(isE164('+15551234567')).toBe(true);
    expect(isE164('+447911123456')).toBe(true);
    expect(isE164('15551234567')).toBe(false); // no +
    expect(isE164('+05551234567')).toBe(false); // leading 0
    expect(isE164('+12345')).toBe(false); // too short (min 7 digits)
    expect(isE164('+1234567890123456')).toBe(false); // too long (max 15)
  });

  it('strips the spacing people type into numbers', () => {
    expect(normalizePhoneNumber('+1 (555) 123-4567')).toBe('+15551234567');
    expect(normalizePhoneNumber('+44 7911.123.456')).toBe('+447911123456');
  });
});

describe('TwilioSettingsCard', () => {
  beforeEach(() => {
    setSetting.mockReset();
    setSetting.mockResolvedValue(undefined);
  });

  it('explains what the account is for and shows "not set up"', () => {
    const { getByText, getByTestId } = renderCard(NONE);
    expect(getByText('Phone calls (Twilio)')).toBeTruthy();
    expect(getByText(/household’s own Twilio account/)).toBeTruthy();
    expect(getByTestId('twilio-status').props.children).toMatch(/Not set up/);
    expect(getByTestId('twilio-edit')).toHaveTextContent('Set up');
  });

  it('shows set status and the from number, never a secret', () => {
    const { getByTestId, queryByText } = renderCard(ALL);
    expect(getByTestId('twilio-status').props.children).toBe('Set up — calls are placed from +15551234567.');
    expect(queryByText(/\*\*\*\*/)).toBeNull();
    expect(getByTestId('twilio-sid-status')).toHaveTextContent('Account SID: set');
    expect(getByTestId('twilio-token-status')).toHaveTextContent('Auth token: set');
  });

  it('names what is missing from a partial set', () => {
    const { getByTestId } = renderCard({ sidSet: true, tokenSet: false, fromNumber: null });
    expect(getByTestId('twilio-status').props.children).toMatch(/Incomplete — missing the auth token, from number/);
  });

  it('a non-admin sees the status but no editor', () => {
    const { queryByTestId, getByText } = renderCard(ALL, false);
    expect(queryByTestId('twilio-edit')).toBeNull();
    expect(queryByTestId('twilio-remove')).toBeNull();
    expect(getByText('Only a household admin can change this.')).toBeTruthy();
  });

  it('first setup writes all three, normalizing the number, then reloads', async () => {
    const { getByTestId, queryByTestId, onChanged } = renderCard(NONE);
    fireEvent.press(getByTestId('twilio-edit'));
    fireEvent.changeText(getByTestId('twilio-sid-input'), ' AC123 ');
    fireEvent.changeText(getByTestId('twilio-token-input'), 'tok');
    fireEvent.changeText(getByTestId('twilio-from-input'), '+1 (555) 123-4567');
    await act(async () => {
      fireEvent.press(getByTestId('twilio-save'));
    });
    expect(setSetting.mock.calls).toEqual([
      ['hh-1', 'phone.twilio_account_sid', 'AC123'],
      ['hh-1', 'phone.twilio_auth_token', 'tok'],
      ['hh-1', 'phone.twilio_from_number', '+15551234567'],
    ]);
    expect(onChanged).toHaveBeenCalled();
    expect(queryByTestId('twilio-sid-input')).toBeNull(); // editor closed
  });

  it('the token field is masked as it is typed', () => {
    const { getByTestId } = renderCard(NONE);
    fireEvent.press(getByTestId('twilio-edit'));
    expect(getByTestId('twilio-token-input').props.secureTextEntry).toBe(true);
  });

  it('rejects a non-E.164 from number without writing', async () => {
    const { getByTestId } = renderCard(NONE);
    fireEvent.press(getByTestId('twilio-edit'));
    fireEvent.changeText(getByTestId('twilio-sid-input'), 'AC123');
    fireEvent.changeText(getByTestId('twilio-token-input'), 'tok');
    fireEvent.changeText(getByTestId('twilio-from-input'), '555-1234');
    await act(async () => {
      fireEvent.press(getByTestId('twilio-save'));
    });
    expect(setSetting).not.toHaveBeenCalled();
    expect(getByTestId('twilio-from-helper')).toHaveTextContent(/international format/);
  });

  it('refuses to save a partial account', async () => {
    const { getByTestId } = renderCard(NONE);
    fireEvent.press(getByTestId('twilio-edit'));
    fireEvent.changeText(getByTestId('twilio-sid-input'), 'AC123');
    fireEvent.changeText(getByTestId('twilio-from-input'), '+15551234567');
    await act(async () => {
      fireEvent.press(getByTestId('twilio-save'));
    });
    expect(setSetting).not.toHaveBeenCalled();
    expect(getByTestId('twilio-error')).toHaveTextContent(/Enter the auth token/);
  });

  it('replacing only the token writes only the token (blank keeps the rest)', async () => {
    const { getByTestId } = renderCard(ALL);
    fireEvent.press(getByTestId('twilio-edit'));
    expect(getByTestId('twilio-from-input').props.value).toBe('+15551234567');
    expect(getByTestId('twilio-save')).toBeDisabled(); // nothing changed yet
    fireEvent.changeText(getByTestId('twilio-token-input'), 'new-token');
    await act(async () => {
      fireEvent.press(getByTestId('twilio-save'));
    });
    expect(setSetting.mock.calls).toEqual([['hh-1', 'phone.twilio_auth_token', 'new-token']]);
  });

  it('shows the server message when a write is rejected and still reloads', async () => {
    setSetting.mockRejectedValueOnce({
      response: {
        status: 400,
        data: { detail: 'Invalid value for phone.twilio_from_number: expected an E.164 number like +15551234567' },
      },
    });
    const { getByTestId, onChanged } = renderCard({ sidSet: true, tokenSet: true, fromNumber: '+15550000000' });
    fireEvent.press(getByTestId('twilio-edit'));
    fireEvent.changeText(getByTestId('twilio-from-input'), '+15551234567');
    await act(async () => {
      fireEvent.press(getByTestId('twilio-save'));
    });
    expect(getByTestId('twilio-error')).toHaveTextContent(/expected an E.164 number/);
    expect(onChanged).toHaveBeenCalled();
    expect(getByTestId('twilio-from-input')).toBeTruthy(); // editor stays open
  });

  it('shows a 422 validation message and a 403 role message', async () => {
    setSetting.mockRejectedValueOnce({
      response: { status: 422, data: { detail: [{ loc: ['body', 'value'], msg: 'Field required' }] } },
    });
    const { getByTestId } = renderCard(ALL);
    fireEvent.press(getByTestId('twilio-edit'));
    fireEvent.changeText(getByTestId('twilio-sid-input'), 'AC9');
    await act(async () => {
      fireEvent.press(getByTestId('twilio-save'));
    });
    expect(getByTestId('twilio-error')).toHaveTextContent('Field required');

    setSetting.mockRejectedValueOnce({
      response: { status: 403, data: { detail: 'User has member role, requires admin or higher' } },
    });
    await act(async () => {
      fireEvent.press(getByTestId('twilio-save'));
    });
    expect(getByTestId('twilio-error')).toHaveTextContent('User has member role, requires admin or higher');
  });

  it('Remove confirms, then clears all three with ""', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const { getByTestId, onChanged } = renderCard(ALL);
    fireEvent.press(getByTestId('twilio-remove'));
    expect(setSetting).not.toHaveBeenCalled(); // nothing before confirming
    const remove = (alertSpy.mock.calls[0][2] as any[]).find((b) => b.text === 'Remove');
    await act(async () => {
      await remove.onPress();
    });
    expect(setSetting.mock.calls).toEqual([
      ['hh-1', 'phone.twilio_account_sid', ''],
      ['hh-1', 'phone.twilio_auth_token', ''],
      ['hh-1', 'phone.twilio_from_number', ''],
    ]);
    expect(onChanged).toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});
