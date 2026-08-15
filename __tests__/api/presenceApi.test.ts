/**
 * presenceApi.reportPresence — the thin POST to CC's /mobile/presence.
 *
 * Pins the URL, that state is sent as-is, and that the optional display name is
 * included only when provided (so we never send an empty name).
 */
import apiClient from '../../src/api/apiClient';
import { reportPresence } from '../../src/api/presenceApi';

jest.mock('../../src/config/serviceConfig', () => ({
  getCommandCenterUrl: () => 'http://cc.test',
}));

jest.mock('../../src/api/apiClient', () => ({
  __esModule: true,
  default: { post: jest.fn() },
}));

const mockPost = (apiClient as unknown as { post: jest.Mock }).post;

beforeEach(() => {
  jest.clearAllMocks();
  mockPost.mockResolvedValue({ data: { ok: true, signal_id: 9, kind: 'presence.seen' } });
});

it('POSTs state to the mobile presence endpoint and returns the result', async () => {
  const res = await reportPresence('hh-1', 'home');
  expect(mockPost).toHaveBeenCalledWith('http://cc.test/api/v0/mobile/presence', {
    household_id: 'hh-1',
    state: 'home',
  });
  expect(res).toEqual({ ok: true, signal_id: 9, kind: 'presence.seen' });
});

it('includes the display name when provided', async () => {
  await reportPresence('hh-1', 'home', 'Alex');
  expect(mockPost).toHaveBeenCalledWith('http://cc.test/api/v0/mobile/presence', {
    household_id: 'hh-1',
    state: 'home',
    name: 'Alex',
  });
});

it('omits the name key entirely when not provided', async () => {
  await reportPresence('hh-1', 'away');
  const body = mockPost.mock.calls[0][1];
  expect(body).not.toHaveProperty('name');
  expect(body.state).toBe('away');
});
