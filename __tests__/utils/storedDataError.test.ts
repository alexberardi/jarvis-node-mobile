import { storedDataErrorMessage } from '../../src/utils/storedDataError';

// The Stored Data browser asks the node over MQTT; cc gives up after 10 s
// (504) and so does the app's HTTP client (an axios timeout, no response).
// Both mean "the node didn't answer" — and for a computer that is usually
// sleep, or an agent too old to answer stored-data requests.

const httpError = (status: number) => ({ isAxiosError: true, response: { status, data: {} } });
const clientTimeout = { isAxiosError: true, code: 'ECONNABORTED', message: 'timeout of 10000ms exceeded' };

describe('storedDataErrorMessage', () => {
  it('keeps the Pi wording for a 504', () => {
    expect(storedDataErrorMessage(httpError(504), false, 'Could not load stored data.')).toBe(
      'Node did not respond. It may be offline.',
    );
  });

  it('treats the app\'s own request timeout like a 504', () => {
    expect(storedDataErrorMessage(clientTimeout, false, 'Could not load stored data.')).toBe(
      'Node did not respond. It may be offline.',
    );
  });

  it('uses computer wording for a desktop agent', () => {
    const msg =
      "This computer didn't answer. It may be asleep or offline, or its Jarvis Automation agent may need an update to show stored data.";
    expect(storedDataErrorMessage(httpError(504), true, 'x')).toBe(msg);
    expect(storedDataErrorMessage(clientTimeout, true, 'x')).toBe(msg);
  });

  it('falls back to the caller\'s message for anything else', () => {
    expect(storedDataErrorMessage(httpError(500), true, 'Could not load commands.')).toBe('Could not load commands.');
    expect(storedDataErrorMessage(new Error('boom'), false, 'Could not load commands.')).toBe('Could not load commands.');
  });
});
