/**
 * nodeApi factory reset — jarvisd's tracked flow (D10).
 *
 * startFactoryReset: POST /api/v0/admin/nodes/{id}/factory-reset → {task_id};
 * a 409 {detail: {message, task_id, state}} means one is already in flight and
 * we resume tracking it. waitForFactoryReset polls GET /api/v0/tasks/{id}
 * until success/failed or the deadline (an offline node never answers).
 */
import apiClient from '../../src/api/apiClient';
import { startFactoryReset, waitForFactoryReset } from '../../src/api/nodeApi';
import { getNodeTask } from '../../src/api/nodeUpdateApi';

jest.mock('../../src/config/serviceConfig', () => ({
  getCommandCenterUrl: () => 'http://cc.test',
}));

jest.mock('../../src/api/apiClient', () => ({
  __esModule: true,
  default: { post: jest.fn(), get: jest.fn(), delete: jest.fn() },
}));

jest.mock('../../src/api/nodeUpdateApi', () => ({
  ...jest.requireActual('../../src/api/nodeUpdateApi'),
  getNodeTask: jest.fn(),
}));

const mockPost = (apiClient as unknown as { post: jest.Mock }).post;
const mockGetTask = getNodeTask as jest.Mock;

const task = (state: string) => ({ id: 't1', node_id: 'n1', kind: 'factory_reset', state, error_message: null });

const axiosError = (status: number, data: unknown) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data },
  });

beforeEach(() => jest.clearAllMocks());

describe('startFactoryReset', () => {
  it('POSTs the tracked factory-reset route and returns the task id', async () => {
    mockPost.mockResolvedValue({ data: { task_id: 't1', reset_token: 'secret' } });
    await expect(startFactoryReset('n1')).resolves.toEqual({ taskId: 't1', alreadyInFlight: false });
    expect(mockPost).toHaveBeenCalledWith('http://cc.test/api/v0/admin/nodes/n1/factory-reset');
  });

  it('resumes the in-flight task on 409', async () => {
    mockPost.mockRejectedValue(
      axiosError(409, { detail: { message: 'A factory reset is already in flight for this node.', task_id: 't0', state: 'dispatched' } }),
    );
    await expect(startFactoryReset('n1')).resolves.toEqual({ taskId: 't0', alreadyInFlight: true });
  });

  it('rethrows other errors', async () => {
    mockPost.mockRejectedValue(axiosError(403, { detail: 'Forbidden' }));
    await expect(startFactoryReset('n1')).rejects.toThrow('403');
  });
});

describe('waitForFactoryReset', () => {
  // A fake clock that advances by each sleep, so no real timers run.
  const clock = () => {
    let t = 0;
    return { now: () => t, sleep: async (ms: number) => { t += ms; } };
  };

  it('polls until the task succeeds, reporting each state', async () => {
    mockGetTask
      .mockResolvedValueOnce(task('dispatched'))
      .mockResolvedValueOnce(task('in_progress'))
      .mockResolvedValueOnce(task('success'));
    const onUpdate = jest.fn();
    const res = await waitForFactoryReset('t1', { timeoutMs: 30_000, onUpdate, ...clock() });
    expect(res?.state).toBe('success');
    expect(onUpdate.mock.calls.map((c) => c[0].state)).toEqual(['dispatched', 'in_progress', 'success']);
    expect(mockGetTask).toHaveBeenCalledWith('t1');
  });

  it('returns the last non-terminal state at the deadline (offline node)', async () => {
    mockGetTask.mockResolvedValue(task('dispatched'));
    const res = await waitForFactoryReset('t1', { timeoutMs: 8_000, intervalMs: 2_000, ...clock() });
    expect(res?.state).toBe('dispatched');
    expect(mockGetTask.mock.calls.length).toBeLessThanOrEqual(5);
  });

  it('keeps polling through a transient read error', async () => {
    mockGetTask.mockRejectedValueOnce(new Error('Network Error')).mockResolvedValueOnce(task('failed'));
    const res = await waitForFactoryReset('t1', { timeoutMs: 30_000, ...clock() });
    expect(res?.state).toBe('failed');
  });

  it('returns null when nothing could be read', async () => {
    mockGetTask.mockRejectedValue(new Error('Network Error'));
    const res = await waitForFactoryReset('t1', { timeoutMs: 4_000, ...clock() });
    expect(res).toBeNull();
  });

  it('stops when cancelled', async () => {
    mockGetTask.mockResolvedValue(task('dispatched'));
    const res = await waitForFactoryReset('t1', { timeoutMs: 30_000, isCancelled: () => true, ...clock() });
    expect(res).toBeNull();
    expect(mockGetTask).not.toHaveBeenCalled();
  });
});
