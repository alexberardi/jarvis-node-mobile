/**
 * signalAutomationsApi — GET the catalog + current rules, PUT one kind's rule.
 * Pins the URLs, the request bodies, and the returned shapes.
 */
import apiClient from '../../src/api/apiClient';
import {
  getSignalAutomations,
  setSignalAutomation,
} from '../../src/api/signalAutomationsApi';

jest.mock('../../src/config/serviceConfig', () => ({
  getCommandCenterUrl: () => 'http://cc.test',
}));

jest.mock('../../src/api/apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn() },
}));

const mockGet = (apiClient as unknown as { get: jest.Mock }).get;
const mockPut = (apiClient as unknown as { put: jest.Mock }).put;

beforeEach(() => jest.clearAllMocks());

describe('getSignalAutomations', () => {
  it('GETs the household endpoint and returns the automations array', async () => {
    mockGet.mockResolvedValue({
      data: {
        household_id: 'hh-1',
        automations: [
          {
            kind: 'presence.left',
            label: 'I leave home',
            description: '',
            facts: {},
            example: 'Lock the front door',
            source: 'mobile',
            observed: true,
            instruction: 'Lock up',
            enabled: true,
          },
        ],
      },
    });
    const res = await getSignalAutomations('hh-1');
    expect(mockGet).toHaveBeenCalledWith(
      'http://cc.test/api/v0/mobile/household/hh-1/signal-automations',
    );
    expect(res).toHaveLength(1);
    expect(res[0].kind).toBe('presence.left');
    expect(res[0].observed).toBe(true);
  });
});

describe('setSignalAutomation', () => {
  it('PUTs instruction + enabled to the kind endpoint and returns the result', async () => {
    mockPut.mockResolvedValue({
      data: { success: true, instruction: 'Lock up', enabled: true, cleared: false },
    });
    const res = await setSignalAutomation('hh-1', 'presence.left', 'Lock up', true);
    expect(mockPut).toHaveBeenCalledWith(
      'http://cc.test/api/v0/mobile/household/hh-1/signal-automations/presence.left',
      { instruction: 'Lock up', enabled: true },
    );
    expect(res).toEqual({ instruction: 'Lock up', enabled: true, cleared: false });
  });

  it('reports a cleared rule (blank instruction)', async () => {
    mockPut.mockResolvedValue({
      data: { success: true, instruction: '', enabled: false, cleared: true },
    });
    const res = await setSignalAutomation('hh-1', 'appt.upcoming', '', false);
    expect(mockPut).toHaveBeenCalledWith(
      'http://cc.test/api/v0/mobile/household/hh-1/signal-automations/appt.upcoming',
      { instruction: '', enabled: false },
    );
    expect(res.cleared).toBe(true);
  });
});
