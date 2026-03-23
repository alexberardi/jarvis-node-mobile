import type { Routine } from '../../src/types/Routine';

// --- Mock configPushService ---
const mockEncryptAndPush = jest.fn();
jest.mock('../../src/services/configPushService', () => ({
  encryptAndPushConfig: (...args: unknown[]) => mockEncryptAndPush(...args),
}));

import {
  pushRoutineToNodes,
  deleteRoutineFromNodes,
} from '../../src/services/routinePushService';

const makeRoutine = (overrides: Partial<Routine> = {}): Routine => ({
  id: 'test_routine',
  name: 'Test Routine',
  trigger_phrases: ['run test', 'test it'],
  steps: [
    { command: 'get_weather', args: [{ key: 'location', value: 'NYC' }], label: 'weather' },
    {
      command: 'get_news',
      args: [
        { key: 'category', value: 'tech' },
        { key: 'count', value: '3' },
      ],
      label: 'news',
    },
  ],
  response_instruction: 'Be brief and cheerful.',
  response_length: 'short',
  background: null,
  ...overrides,
});

describe('routinePushService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEncryptAndPush.mockResolvedValue(undefined);
  });

  // --- Serialization (tested via pushRoutineToNodes call) ---

  describe('pushRoutineToNodes', () => {
    it('serializes routine to node format with args as object', async () => {
      const routine = makeRoutine();
      await pushRoutineToNodes(routine, ['node-1']);

      expect(mockEncryptAndPush).toHaveBeenCalledWith('node-1', 'routines', {
        test_routine: {
          trigger_phrases: ['run test', 'test it'],
          steps: [
            { command: 'get_weather', args: { location: 'NYC' }, label: 'weather' },
            { command: 'get_news', args: { category: 'tech', count: '3' }, label: 'news' },
          ],
          response_instruction: 'Be brief and cheerful.',
          response_length: 'short',
          background: null,
        },
      });
    });

    it('converts empty args array to empty object', async () => {
      const routine = makeRoutine({
        steps: [{ command: 'get_weather', args: [], label: 'weather' }],
      });
      await pushRoutineToNodes(routine, ['node-1']);

      const pushed = mockEncryptAndPush.mock.calls[0][2];
      expect(pushed.test_routine.steps[0].args).toEqual({});
    });

    it('includes background config when present', async () => {
      const routine = makeRoutine({
        background: {
          enabled: true,
          schedule_type: 'cron',
          interval_minutes: 30,
          run_on_startup: false,
          days: ['mon', 'wed', 'fri'],
          time: '08:00',
          summary_style: 'detailed',
          alert_priority: 3,
          alert_ttl_minutes: 60,
        },
      });
      await pushRoutineToNodes(routine, ['node-1']);

      const pushed = mockEncryptAndPush.mock.calls[0][2];
      expect(pushed.test_routine.background).toEqual({
        enabled: true,
        schedule_type: 'cron',
        interval_minutes: 30,
        run_on_startup: false,
        days: ['mon', 'wed', 'fri'],
        time: '08:00',
        summary_style: 'detailed',
        alert_priority: 3,
        alert_ttl_minutes: 60,
      });
    });

    it('pushes to multiple nodes', async () => {
      const routine = makeRoutine();
      const results = await pushRoutineToNodes(routine, ['node-1', 'node-2', 'node-3']);

      expect(mockEncryptAndPush).toHaveBeenCalledTimes(3);
      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);
      expect(results.map((r) => r.nodeId)).toEqual(['node-1', 'node-2', 'node-3']);
    });

    it('returns success results per node', async () => {
      const routine = makeRoutine();
      const results = await pushRoutineToNodes(routine, ['node-1']);

      expect(results).toEqual([{ nodeId: 'node-1', success: true }]);
    });

    it('handles partial failure gracefully', async () => {
      mockEncryptAndPush
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Node offline'))
        .mockResolvedValueOnce(undefined);

      const routine = makeRoutine();
      const results = await pushRoutineToNodes(routine, ['node-1', 'node-2', 'node-3']);

      expect(results).toEqual([
        { nodeId: 'node-1', success: true },
        { nodeId: 'node-2', success: false, error: 'Node offline' },
        { nodeId: 'node-3', success: true },
      ]);
    });

    it('handles non-Error throw', async () => {
      mockEncryptAndPush.mockRejectedValueOnce('string error');

      const results = await pushRoutineToNodes(makeRoutine(), ['node-1']);

      expect(results).toEqual([{ nodeId: 'node-1', success: false, error: 'Push failed' }]);
    });

    it('handles all nodes failing', async () => {
      mockEncryptAndPush.mockRejectedValue(new Error('Server down'));

      const results = await pushRoutineToNodes(makeRoutine(), ['node-1', 'node-2']);

      expect(results).toEqual([
        { nodeId: 'node-1', success: false, error: 'Server down' },
        { nodeId: 'node-2', success: false, error: 'Server down' },
      ]);
    });

    it('handles empty node list', async () => {
      const results = await pushRoutineToNodes(makeRoutine(), []);

      expect(mockEncryptAndPush).not.toHaveBeenCalled();
      expect(results).toEqual([]);
    });

    it('uses routine id as the config key', async () => {
      const routine = makeRoutine({ id: 'custom_id_123' });
      await pushRoutineToNodes(routine, ['node-1']);

      const pushed = mockEncryptAndPush.mock.calls[0][2];
      expect(Object.keys(pushed)).toEqual(['custom_id_123']);
    });
  });

  describe('deleteRoutineFromNodes', () => {
    it('sends null value for the routine id', async () => {
      await deleteRoutineFromNodes('my_routine', ['node-1']);

      expect(mockEncryptAndPush).toHaveBeenCalledWith('node-1', 'routines', {
        my_routine: null,
      });
    });

    it('deletes from multiple nodes', async () => {
      const results = await deleteRoutineFromNodes('my_routine', ['node-1', 'node-2']);

      expect(mockEncryptAndPush).toHaveBeenCalledTimes(2);
      expect(results).toEqual([
        { nodeId: 'node-1', success: true },
        { nodeId: 'node-2', success: true },
      ]);
    });

    it('handles partial failure on delete', async () => {
      mockEncryptAndPush
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Timeout'));

      const results = await deleteRoutineFromNodes('my_routine', ['node-1', 'node-2']);

      expect(results).toEqual([
        { nodeId: 'node-1', success: true },
        { nodeId: 'node-2', success: false, error: 'Timeout' },
      ]);
    });

    it('handles non-Error throw on delete', async () => {
      mockEncryptAndPush.mockRejectedValueOnce(42);

      const results = await deleteRoutineFromNodes('my_routine', ['node-1']);

      expect(results).toEqual([{ nodeId: 'node-1', success: false, error: 'Delete failed' }]);
    });
  });
});
