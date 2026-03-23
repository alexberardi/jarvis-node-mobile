/**
 * Manages per-node placeholder bindings for routines.
 *
 * Bindings map placeholder names to resolved entity IDs (e.g., "living_room_lights" -> "light.living_room").
 * Stored per-node since different nodes may have different devices visible.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const BINDING_KEY_PREFIX = 'routine_bindings';

function storageKey(routineId: string, nodeId: string): string {
  return `${BINDING_KEY_PREFIX}:${routineId}:${nodeId}`;
}

export async function saveBindings(
  routineId: string,
  nodeId: string,
  bindings: Record<string, string>,
): Promise<void> {
  await AsyncStorage.setItem(storageKey(routineId, nodeId), JSON.stringify(bindings));
}

export async function getBindings(
  routineId: string,
  nodeId: string,
): Promise<Record<string, string> | null> {
  const raw = await AsyncStorage.getItem(storageKey(routineId, nodeId));
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function deleteBindings(
  routineId: string,
  nodeId: string,
): Promise<void> {
  await AsyncStorage.removeItem(storageKey(routineId, nodeId));
}

export async function getAllBindingsForRoutine(
  routineId: string,
): Promise<Record<string, Record<string, string>>> {
  const allKeys = await AsyncStorage.getAllKeys();
  const prefix = `${BINDING_KEY_PREFIX}:${routineId}:`;
  const matching = allKeys.filter((k) => k.startsWith(prefix));

  const result: Record<string, Record<string, string>> = {};
  for (const key of matching) {
    const nodeId = key.slice(prefix.length);
    const bindings = await getBindings(routineId, nodeId);
    if (bindings) {
      result[nodeId] = bindings;
    }
  }
  return result;
}

/**
 * Check the dependency/config status of a routine for a given node.
 */
export async function checkRoutineStatus(
  routine: { placeholders?: Record<string, { required: boolean }>; required_commands?: string[] },
  nodeToolNames: string[],
  routineId: string,
  nodeId: string,
): Promise<'ready' | 'needs_config' | 'missing_commands'> {
  // Check required commands
  const requiredCommands = routine.required_commands ?? [];
  const commandsFromSteps = new Set<string>();
  // If required_commands is empty, infer from steps (caller should pass them)

  for (const cmd of requiredCommands) {
    if (!nodeToolNames.includes(cmd)) {
      return 'missing_commands';
    }
  }

  // Check placeholder bindings
  const placeholders = routine.placeholders ?? {};
  const requiredPlaceholders = Object.entries(placeholders).filter(
    ([, p]) => p.required,
  );

  if (requiredPlaceholders.length > 0) {
    const bindings = await getBindings(routineId, nodeId);
    for (const [name] of requiredPlaceholders) {
      if (!bindings?.[name]) {
        return 'needs_config';
      }
    }
  }

  return 'ready';
}
