/**
 * routineApi.runRoutineNow — its own long timeout.
 *
 * jarvisd holds run-now open until the node reports (up to 60 s, then
 * `status: "timeout"`), so the shared apiClient's 10 s default would abort a
 * routine that is still running. Pins the per-call timeout and that it stays
 * above the server's wait.
 */
import apiClient from '../../src/api/apiClient';
import { RUN_NOW_TIMEOUT_MS, runRoutineNow } from '../../src/api/routineApi';

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
  mockPost.mockResolvedValue({
    data: { success: true, status: 'success', message: 'Done', passed: 2, failed: 0 },
  });
});

it('POSTs run-now with a per-call timeout well above the server wait', async () => {
  const res = await runRoutineNow('hh-1', 'r1', 'n1');
  expect(mockPost).toHaveBeenCalledWith(
    'http://cc.test/api/v0/households/hh-1/routines/r1/run-now',
    { node_id: 'n1' },
    { timeout: RUN_NOW_TIMEOUT_MS },
  );
  expect(RUN_NOW_TIMEOUT_MS).toBeGreaterThan(60_000);
  expect(res.status).toBe('success');
});

it('sends node_id null to fall back to the primary node', async () => {
  await runRoutineNow('hh-1', 'r1');
  expect(mockPost.mock.calls[0][1]).toEqual({ node_id: null });
});
