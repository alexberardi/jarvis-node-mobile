/**
 * pairingApi — device-code pairing for a computer (jarvis-server cc pairing.go,
 * install plan 3.4). The member's side only: list what's waiting, approve a code
 * into one of their own households, or deny it. All three are user-JWT routes.
 */
import apiClient from '../../src/api/apiClient';
import {
  AGENT_DOWNLOAD_URL,
  approvePairing,
  denyPairing,
  listPairings,
  pairingErrorMessage,
} from '../../src/api/pairingApi';

jest.mock('../../src/config/serviceConfig', () => ({
  getCommandCenterUrl: () => 'http://cc.test',
}));

jest.mock('../../src/api/apiClient', () => ({
  __esModule: true,
  default: { post: jest.fn(), get: jest.fn() },
}));

const mockGet = (apiClient as unknown as { get: jest.Mock }).get;
const mockPost = (apiClient as unknown as { post: jest.Mock }).post;

const axiosError = (status: number, data: unknown) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data },
  });

beforeEach(() => jest.clearAllMocks());

describe('listPairings', () => {
  it('GETs /api/v0/nodes/pairings and returns pairings and the caller\'s households', async () => {
    mockGet.mockResolvedValue({
      data: {
        pairings: [
          { code: 'ABCD-EFGH', name: 'Office-PC', platform: 'linux', requested_from: '10.0.0.5', created_at: '2026-10-14T10:00:00Z', expires_in: 540 },
        ],
        households: [{ id: 'hh-1', name: 'Home', role: 'member' }],
      },
    });
    const res = await listPairings();
    expect(mockGet).toHaveBeenCalledWith('http://cc.test/api/v0/nodes/pairings', { timeout: 10000 });
    expect(res.pairings[0].code).toBe('ABCD-EFGH');
    expect(res.households).toEqual([{ id: 'hh-1', name: 'Home', role: 'member' }]);
  });

  it('treats missing arrays as empty', async () => {
    mockGet.mockResolvedValue({ data: {} });
    expect(await listPairings()).toEqual({ pairings: [], households: [] });
  });
});

describe('approvePairing', () => {
  it('POSTs the code, household and room', async () => {
    mockPost.mockResolvedValue({ data: { status: 'approved', code: 'ABCD-EFGH', household_id: 'hh-1', room: 'office', name: 'Office-PC' } });
    const res = await approvePairing({ code: 'ABCD-EFGH', householdId: 'hh-1', room: 'office' });
    expect(mockPost).toHaveBeenCalledWith('http://cc.test/api/v0/nodes/pairings/approve', {
      code: 'ABCD-EFGH',
      household_id: 'hh-1',
      room: 'office',
    });
    expect(res.status).toBe('approved');
  });

  it('sends the default room "desktop" when the room is blank', async () => {
    mockPost.mockResolvedValue({ data: { status: 'approved' } });
    await approvePairing({ code: 'X', householdId: 'hh-1', room: '   ' });
    expect(mockPost.mock.calls[0][1].room).toBe('desktop');
  });
});

describe('denyPairing', () => {
  it('POSTs the code', async () => {
    mockPost.mockResolvedValue({ data: { status: 'denied', code: 'ABCD-EFGH' } });
    await denyPairing('ABCD-EFGH');
    expect(mockPost).toHaveBeenCalledWith('http://cc.test/api/v0/nodes/pairings/deny', { code: 'ABCD-EFGH' });
  });
});

describe('pairingErrorMessage', () => {
  it('uses the server detail', () => {
    expect(pairingErrorMessage(axiosError(404, { detail: 'Pairing code not found or expired' }), 'fb')).toBe(
      'Pairing code not found or expired',
    );
  });

  it('says what a 403 means when the server sends no detail', () => {
    expect(pairingErrorMessage(axiosError(403, {}), 'fb')).toMatch(/only into a household you belong to/);
  });

  it('falls back', () => {
    expect(pairingErrorMessage(undefined, 'fb')).toBe('fb');
  });
});

describe('AGENT_DOWNLOAD_URL', () => {
  it('is the public release page until the server serves the verified download', () => {
    expect(AGENT_DOWNLOAD_URL).toBe('https://github.com/alexberardi/jarvis-server/releases');
  });
});
