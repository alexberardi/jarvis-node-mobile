import { settingErrorMessage } from '../../src/api/householdSettingsApi';

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
