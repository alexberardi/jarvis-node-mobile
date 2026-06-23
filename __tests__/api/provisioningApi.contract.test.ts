/**
 * Mobile <-> node provisioning WIRE CONTRACT — mobile side.
 *
 * The provisioning HTTP contract is hand-mirrored on two sides that no test
 * crosses today:
 *   - node-mobile : src/types/Provisioning.ts + src/api/provisioningApi.ts (here)
 *   - node-setup  : provisioning/models.py + provisioning/api.py
 *
 * provisioningApi.ts builds the request bodies the node validates with Pydantic.
 * The riskiest seam is K2: the app's K2ProvisioningRequest type is camelCase
 * (nodeId/createdAt) but the node REQUIRES snake_case, bridged ONLY by a
 * hand-written transform (provisioningApi.ts:147-152). If a field is added to the
 * type but not the transform, the app POSTs a body the node 422s — silently, at
 * runtime, on a real Pi.
 *
 * This file mocks axios and asserts the EXACT wire bodies `provision` / `provisionK2`
 * POST, plus the response fields the GET helpers read. The MIRROR test lives in
 * jarvis-integration-tests (tests/test_provisioning_contract.py) and pins the node
 * side over real HTTP. Both ends assert against the same field sets
 * (PROVISIONING_WIRE_CONTRACT below) — keep the two copies in lockstep; the
 * runbook (jarvis-integration-tests/docs/mobile-e2e.md) explains the pairing.
 */

// axios.create() must return a stable mock instance whose get/post we capture.
// (Named with the `mock` prefix so jest's hoisted factory may reference it.)
const mockNodeApi = { get: jest.fn(), post: jest.fn() };
jest.mock('axios', () => ({
  __esModule: true,
  default: { create: jest.fn(() => mockNodeApi) },
}));

// The provision() path reads these for the command_center_url / config_service_url
// fields; pin them so the asserted body is deterministic.
jest.mock('../../src/config/serviceConfig', () => ({
  getCommandCenterUrl: jest.fn(() => 'http://10.0.0.5:7703'),
  getServiceConfig: jest.fn(() => ({ configServiceUrl: 'http://10.0.0.5:7700' })),
}));

import {
  getNodeInfo,
  scanNetworks,
  provision,
  getProvisioningStatus,
  provisionK2,
} from '../../src/api/provisioningApi';
import {
  ProvisioningRequest,
  K2ProvisioningRequest,
} from '../../src/types/Provisioning';

// Mirror of jarvis-integration-tests/tests/test_provisioning_contract.py
// PROVISIONING_WIRE_CONTRACT. The wire field NAMES the two repos must agree on.
const WIRE = {
  ProvisionRequest: {
    required: [
      'wifi_ssid',
      'wifi_password',
      'room',
      'command_center_url',
      'household_id',
      'node_id',
      'provisioning_token',
    ],
    optional: ['config_service_url'],
  },
  K2ProvisionRequest: {
    required: ['node_id', 'kid', 'k2', 'created_at'],
    optional: [] as string[],
  },
};

beforeEach(() => {
  mockNodeApi.get.mockReset();
  mockNodeApi.post.mockReset();
});

describe('provisioning wire contract — request bodies', () => {
  it('provision() POSTs the snake_case ProvisionRequest the node expects', async () => {
    mockNodeApi.post.mockResolvedValue({ data: { success: true, message: 'ok' } });

    const req: ProvisioningRequest = {
      ssid: 'HomeWiFi',
      password: 'correct-horse',
      room_name: 'kitchen',
      command_center_url: 'http://10.0.0.5:7703',
      household_id: '11111111-1111-1111-1111-111111111111',
      node_id: '22222222-2222-2222-2222-222222222222',
      provisioning_token: 'prov-token-abc',
    };
    await provision(req);

    expect(mockNodeApi.post).toHaveBeenCalledTimes(1);
    const [path, body] = mockNodeApi.post.mock.calls[0];
    expect(path).toBe('/api/v1/provision');

    // The wire body is EXACTLY required ∪ optional — no extra keys, none missing.
    // A renamed/dropped field in the app's transform turns this red (and the node
    // -side mirror catches the same drift from the other direction).
    const allowed = new Set([...WIRE.ProvisionRequest.required, ...WIRE.ProvisionRequest.optional]);
    expect(new Set(Object.keys(body))).toEqual(allowed);
    for (const key of WIRE.ProvisionRequest.required) {
      expect(body[key]).toBeDefined();
    }

    // Pin the internal->wire field mapping (the silent-rename guard).
    expect(body.wifi_ssid).toBe(req.ssid);
    expect(body.wifi_password).toBe(req.password);
    expect(body.room).toBe(req.room_name);
    expect(body.command_center_url).toBe(req.command_center_url);
    expect(body.config_service_url).toBe('http://10.0.0.5:7700');
    expect(body.household_id).toBe(req.household_id);
    expect(body.node_id).toBe(req.node_id);
    expect(body.provisioning_token).toBe(req.provisioning_token);
  });

  it('provisionK2() transforms camelCase -> snake_case on the wire (the fragile seam)', async () => {
    mockNodeApi.post.mockResolvedValue({ data: { success: true, node_id: 'n', kid: 'k' } });

    const req: K2ProvisioningRequest = {
      nodeId: '22222222-2222-2222-2222-222222222222',
      kid: 'k2-2026-06',
      k2: 'YWJj',
      createdAt: '2026-06-23T00:00:00Z',
    };
    await provisionK2(req);

    expect(mockNodeApi.post).toHaveBeenCalledTimes(1);
    const [path, body] = mockNodeApi.post.mock.calls[0];
    expect(path).toBe('/api/v1/provision/k2');

    // The node requires snake_case; the app's type is camelCase. Assert the wire
    // body is the snake_case set, carries the transformed values, and leaks NO
    // camelCase key (a forgotten transform would 422 on a real node).
    expect(new Set(Object.keys(body))).toEqual(new Set(WIRE.K2ProvisionRequest.required));
    expect(body.node_id).toBe(req.nodeId);
    expect(body.created_at).toBe(req.createdAt);
    expect(body.kid).toBe(req.kid);
    expect(body.k2).toBe(req.k2);
    expect(body).not.toHaveProperty('nodeId');
    expect(body).not.toHaveProperty('createdAt');
  });
});

describe('provisioning wire contract — response parsing', () => {
  it('getNodeInfo() reads GET /api/v1/info', async () => {
    const info = {
      node_id: 'jarvis-abc',
      firmware_version: '1.0.0',
      hardware: 'pi-zero-w',
      mac_address: 'b8:27:eb:aa:bb:cc',
      capabilities: ['voice', 'speaker'],
      state: 'AP_MODE',
    };
    mockNodeApi.get.mockResolvedValue({ data: info });

    const result = await getNodeInfo();
    expect(mockNodeApi.get).toHaveBeenCalledWith('/api/v1/info');
    expect(result).toEqual(info);
  });

  it('scanNetworks() reads response.data.networks from GET /api/v1/scan-networks', async () => {
    const networks = [{ ssid: 'HomeWiFi', signal_strength: -45, security: 'WPA2' }];
    mockNodeApi.get.mockResolvedValue({ data: { networks } });

    const result = await scanNetworks();
    expect(mockNodeApi.get).toHaveBeenCalledWith('/api/v1/scan-networks');
    expect(result).toEqual(networks);
  });

  it('getProvisioningStatus() reads progress_percent / message / error and maps state', async () => {
    mockNodeApi.get.mockResolvedValue({
      data: { state: 'CONNECTING', message: 'Connecting...', progress_percent: 35, error: null },
    });

    const status = await getProvisioningStatus();
    expect(mockNodeApi.get).toHaveBeenCalledWith('/api/v1/status');
    // The app reads these exact response field names; a node-side rename would
    // surface here (progress would go undefined, error would stop clearing).
    expect(status.progress).toBe(35);
    expect(status.message).toBe('Connecting...');
    expect(status.error).toBeUndefined();
    expect(status.state).toBe('provisioning'); // CONNECTING -> 'provisioning'
  });
});
