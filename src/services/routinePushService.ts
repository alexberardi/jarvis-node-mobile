import type { Routine } from '../types/Routine';
import { encryptAndPushConfig } from './configPushService';

export interface PushResult {
  nodeId: string;
  success: boolean;
  error?: string;
}

/**
 * Convert a Routine to the node config format expected by _load_routines().
 *
 * Node format:
 * { "routine_id": { trigger_phrases, steps: [{command, args: {k:v}, label}],
 *     response_instruction, response_length, background } }
 */
const toNodeFormat = (routine: Routine): Record<string, unknown> => ({
  [routine.id]: {
    trigger_phrases: routine.trigger_phrases,
    steps: routine.steps.map((step) => ({
      command: step.command,
      args: Object.fromEntries(step.args.map((a) => [a.key, a.value])),
      label: step.label,
    })),
    response_instruction: routine.response_instruction,
    response_length: routine.response_length,
    background: routine.background,
  },
});

export const pushRoutineToNodes = async (
  routine: Routine,
  nodeIds: string[],
): Promise<PushResult[]> => {
  const configData = toNodeFormat(routine);
  const results: PushResult[] = [];

  for (const nodeId of nodeIds) {
    try {
      await encryptAndPushConfig(
        nodeId,
        'routines',
        configData as Record<string, string>,
      );
      results.push({ nodeId, success: true });
    } catch (err) {
      results.push({
        nodeId,
        success: false,
        error: err instanceof Error ? err.message : 'Push failed',
      });
    }
  }

  return results;
};

export const deleteRoutineFromNodes = async (
  routineId: string,
  nodeIds: string[],
): Promise<PushResult[]> => {
  const configData = { [routineId]: null } as unknown as Record<string, string>;
  const results: PushResult[] = [];

  for (const nodeId of nodeIds) {
    try {
      await encryptAndPushConfig(
        nodeId,
        'routines',
        configData,
      );
      results.push({ nodeId, success: true });
    } catch (err) {
      results.push({
        nodeId,
        success: false,
        error: err instanceof Error ? err.message : 'Delete failed',
      });
    }
  }

  return results;
};
