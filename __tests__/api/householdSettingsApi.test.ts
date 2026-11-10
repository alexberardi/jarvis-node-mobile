import {
  isPantryDisabledError,
  pantryEnabledFromSettings,
  settingErrorMessage,
} from '../../src/api/householdSettingsApi';

// The household-settings routes answer errors in three shapes: {detail: str}
// (4xx from the handler), FastAPI-style 422 {detail: [{msg}]}, and CC's
// validation envelope {message, details: [str]}.
describe('settingErrorMessage', () => {
  it('reads a string detail', () => {
    expect(settingErrorMessage({ response: { data: { detail: 'nope' } } }, 'fb')).toBe('nope');
  });
  it('reads the first msg of a 422 detail list', () => {
    expect(
      settingErrorMessage({ response: { data: { detail: [{ msg: 'Field required' }] } } }, 'fb'),
    ).toBe('Field required');
  });
  it('reads the first entry of a validation envelope', () => {
    expect(
      settingErrorMessage(
        { response: { data: { error: 'validation_error', message: 'Request validation failed.', details: ['body -> value: Field required'] } } },
        'fb',
      ),
    ).toBe('body -> value: Field required');
  });
  it('falls back on a network error', () => {
    expect(settingErrorMessage(new Error('Network Error'), 'fb')).toBe('fb');
  });
});

describe('pantryEnabledFromSettings', () => {
  it('follows the key when the server has it', () => {
    expect(pantryEnabledFromSettings({ 'pantry.enabled': true })).toBe(true);
    expect(pantryEnabledFromSettings({ 'pantry.enabled': false })).toBe(false);
  });
  it('treats an absent key (legacy server) as on', () => {
    expect(pantryEnabledFromSettings({ 'web_search.enabled': false })).toBe(true);
  });
});

describe('isPantryDisabledError', () => {
  it('matches a 403 with code pantry_disabled', () => {
    expect(
      isPantryDisabledError({ response: { status: 403, data: { detail: 'off', code: 'pantry_disabled' } } }),
    ).toBe(true);
  });
  it('ignores other 403s, other statuses and network errors', () => {
    expect(isPantryDisabledError({ response: { status: 403, data: { detail: 'nope' } } })).toBe(false);
    expect(isPantryDisabledError({ response: { status: 400, data: { code: 'pantry_disabled' } } })).toBe(false);
    expect(isPantryDisabledError({ response: { status: 403, data: 'Forbidden' } })).toBe(false);
    expect(isPantryDisabledError(new Error('Network Error'))).toBe(false);
  });
});
