import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useSettingsSnapshot } from '../../src/hooks/useSettingsSnapshot';
import { getNode, listNodes } from '../../src/api/nodeApi';
import {
  pollSettingsResult,
  provisionK2ToNode,
  requestSettingsSnapshot,
} from '../../src/api/nodeSettingsApi';
import { generateK2, hasK2, storeK2 } from '../../src/services/k2Service';
import { decryptSettingsSnapshot } from '../../src/services/settingsDecryptService';

// A node with no encryption key (K2) never answers a snapshot request: it has nothing to
// seal it with. A desktop computer gets a new node id each time it signs in again, so it
// starts with no key, and the routine editor used to wait 30 s and then say the node "did
// not respond in time" while it was online. When neither this phone nor the node holds a
// key, the hook now says so up front and can set one up (as Node Settings does).

jest.mock('../../src/api/nodeApi', () => ({ listNodes: jest.fn(), getNode: jest.fn() }));
jest.mock('../../src/api/nodeSettingsApi', () => ({
  requestSettingsSnapshot: jest.fn(),
  pollSettingsResult: jest.fn(),
  provisionK2ToNode: jest.fn(),
}));
jest.mock('../../src/services/k2Service', () => ({
  hasK2: jest.fn(),
  generateK2: jest.fn(),
  storeK2: jest.fn(),
}));
jest.mock('../../src/services/settingsDecryptService', () => {
  class MissingK2KeyError extends Error {
    nodeId: string;
    constructor(nodeId: string) {
      super(`No K2 key on this device for node ${nodeId}`);
      this.nodeId = nodeId;
    }
  }
  return { decryptSettingsSnapshot: jest.fn(), MissingK2KeyError };
});

const mockHasK2 = hasK2 as jest.Mock;
const mockGetNode = getNode as jest.Mock;
const mockRequest = requestSettingsSnapshot as jest.Mock;
const mockPoll = pollSettingsResult as jest.Mock;
const mockProvision = provisionK2ToNode as jest.Mock;
const mockGenerate = generateK2 as jest.Mock;
const mockStore = storeK2 as jest.Mock;
const mockDecrypt = decryptSettingsSnapshot as jest.Mock;

const SNAPSHOT = { commands: [{ command_name: 'get_weather', enabled: true }] };

function answerSnapshot() {
  mockRequest.mockResolvedValue({ request_id: 'rq-1' });
  mockPoll.mockResolvedValue({
    status: 'fulfilled',
    snapshot: { ciphertext: 'c', nonce: 'n', tag: 't' },
  });
  mockDecrypt.mockResolvedValue(SNAPSHOT);
}

describe('useSettingsSnapshot: a node with no encryption key', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    answerSnapshot();
  });

  it('says the key is missing instead of requesting a snapshot nobody can seal', async () => {
    mockHasK2.mockResolvedValue(false);
    mockGetNode.mockResolvedValue({ node_id: 'desk-1', needs_k2: true });

    const { result } = renderHook(() => useSettingsSnapshot({ nodeId: 'desk-1' }));

    await waitFor(() => expect(result.current.state).toBe('needs_k2'));
    expect(result.current.error).toMatch(/encryption key/i);
    expect(mockGetNode).toHaveBeenCalledWith('desk-1');
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it('sets up a key and then loads the snapshot', async () => {
    mockHasK2.mockResolvedValue(false);
    mockGetNode.mockResolvedValue({ node_id: 'desk-1', needs_k2: true });
    const pair = { k2: 'key', kid: 'k2-202610-abc', nodeId: 'desk-1', createdAt: '2026-10-15T00:00:00Z' };
    mockGenerate.mockResolvedValue(pair);
    mockProvision.mockResolvedValue(undefined);
    mockStore.mockImplementation(async () => {
      mockHasK2.mockResolvedValue(true);
    });

    const { result } = renderHook(() => useSettingsSnapshot({ nodeId: 'desk-1' }));
    await waitFor(() => expect(result.current.state).toBe('needs_k2'));

    await act(async () => {
      await result.current.provisionKey();
    });

    await waitFor(() => expect(result.current.state).toBe('loaded'));
    expect(mockGenerate).toHaveBeenCalledWith('desk-1');
    expect(mockProvision).toHaveBeenCalledWith('desk-1', 'key', 'k2-202610-abc', '2026-10-15T00:00:00Z');
    expect(mockStore).toHaveBeenCalledWith(pair);
    // The phone keeps the key only once the node has acknowledged it.
    expect(mockProvision.mock.invocationCallOrder[0]).toBeLessThan(mockStore.mock.invocationCallOrder[0]);
    expect(mockRequest).toHaveBeenCalledWith('desk-1', false);
    expect(result.current.snapshot).toEqual(SNAPSHOT);
  });

  it('reports a failed key setup as an error', async () => {
    mockHasK2.mockResolvedValue(false);
    mockGetNode.mockResolvedValue({ node_id: 'desk-1', needs_k2: true });
    mockGenerate.mockResolvedValue({ k2: 'key', kid: 'k', nodeId: 'desk-1', createdAt: 'x' });
    mockProvision.mockRejectedValue(new Error('Node did not acknowledge K2'));

    const { result } = renderHook(() => useSettingsSnapshot({ nodeId: 'desk-1' }));
    await waitFor(() => expect(result.current.state).toBe('needs_k2'));
    await act(async () => {
      await result.current.provisionKey();
    });

    expect(result.current.state).toBe('error');
    expect(result.current.error).toMatch(/did not acknowledge/);
    expect(mockStore).not.toHaveBeenCalled();
  });

  it('still asks a node that holds a key set up on another phone (no_access, as before)', async () => {
    mockHasK2.mockResolvedValue(false);
    mockGetNode.mockResolvedValue({ node_id: 'pi-1', needs_k2: false });

    const { result } = renderHook(() => useSettingsSnapshot({ nodeId: 'pi-1' }));

    await waitFor(() => expect(result.current.state).toBe('loaded'));
    expect(mockRequest).toHaveBeenCalledWith('pi-1', false);
  });

  it('does not look the node up when this phone has its key', async () => {
    mockHasK2.mockResolvedValue(true);

    const { result } = renderHook(() => useSettingsSnapshot({ nodeId: 'pi-1' }));

    await waitFor(() => expect(result.current.state).toBe('loaded'));
    expect(mockGetNode).not.toHaveBeenCalled();
    expect(mockRequest).toHaveBeenCalledWith('pi-1', false);
  });

  it('falls back to asking the node when the node lookup fails', async () => {
    mockHasK2.mockResolvedValue(false);
    mockGetNode.mockRejectedValue(new Error('network'));

    const { result } = renderHook(() => useSettingsSnapshot({ nodeId: 'pi-1' }));

    await waitFor(() => expect(result.current.state).toBe('loaded'));
    expect(mockRequest).toHaveBeenCalledWith('pi-1', false);
  });

  it('resolves the first node when none is given, then checks its key', async () => {
    (listNodes as jest.Mock).mockResolvedValue([{ node_id: 'desk-1' }]);
    mockHasK2.mockResolvedValue(false);
    mockGetNode.mockResolvedValue({ node_id: 'desk-1', needs_k2: true });

    const { result } = renderHook(() => useSettingsSnapshot());

    await waitFor(() => expect(result.current.state).toBe('needs_k2'));
    expect(result.current.resolvedNodeId).toBe('desk-1');
  });
});
