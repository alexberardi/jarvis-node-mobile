/**
 * Export/import routines as shareable JSON files.
 *
 * Export strips bindings (device-specific), background schedule (user preference),
 * and any values that look like secrets. Adds export metadata.
 */

import { Share, Platform } from 'react-native';
import type { Routine } from '../types/Routine';

const EXPORT_VERSION = 1;

/** Patterns that suggest sensitive values — strip these from step args. */
const SENSITIVE_PATTERNS = [
  /^sk-/i,        // API keys
  /^Bearer\s/i,   // Auth tokens
  /^ghp_/i,       // GitHub tokens
  /^xox[bpas]-/i, // Slack tokens
];

function isSensitive(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return SENSITIVE_PATTERNS.some((p) => p.test(value));
}

function stripSensitiveArgs(
  args: Array<{ key: string; value: string }>,
): Array<{ key: string; value: string }> {
  return args.map((arg) => ({
    key: arg.key,
    value: isSensitive(arg.value) ? '' : arg.value,
  }));
}

export interface RoutineExport {
  export_version: number;
  exported_at: string;
  routine: Omit<Routine, 'id'> & { id?: string };
}

/**
 * Prepare a routine for export.
 * Strips: id (regenerated on import), bindings, background schedule, sensitive arg values.
 */
export function exportRoutine(routine: Routine): RoutineExport {
  return {
    export_version: EXPORT_VERSION,
    exported_at: new Date().toISOString(),
    routine: {
      name: routine.name,
      trigger_phrases: routine.trigger_phrases,
      steps: routine.steps.map((step) => ({
        ...step,
        args: stripSensitiveArgs(step.args),
      })),
      response_instruction: routine.response_instruction,
      response_length: routine.response_length,
      background: null, // Strip schedule — user configures on import
      placeholders: routine.placeholders,
      required_commands: routine.required_commands,
    },
  };
}

/**
 * Share a routine via the OS share sheet as JSON.
 */
export async function shareRoutine(routine: Routine): Promise<void> {
  const payload = exportRoutine(routine);
  const json = JSON.stringify(payload, null, 2);
  const filename = `${routine.id}.jarvis-routine.json`;

  await Share.share(
    Platform.OS === 'ios'
      ? { message: json, title: filename }
      : { message: json, title: filename },
  );
}

/**
 * Parse and validate an imported routine JSON string.
 * Regenerates the id from the name. Returns null if invalid.
 */
export function parseImportedRoutine(json: string): Routine | null {
  try {
    const parsed = JSON.parse(json);

    // Accept both wrapped (RoutineExport) and raw (Routine) formats
    const data = parsed.routine ?? parsed;

    if (!data.name || !data.trigger_phrases || !data.steps || !data.response_instruction) {
      return null;
    }

    if (!Array.isArray(data.trigger_phrases) || data.trigger_phrases.length === 0) {
      return null;
    }

    if (!Array.isArray(data.steps) || data.steps.length === 0) {
      return null;
    }

    // Regenerate ID from name
    const id = data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');

    return {
      id,
      name: data.name,
      trigger_phrases: data.trigger_phrases,
      steps: data.steps,
      response_instruction: data.response_instruction,
      response_length: data.response_length ?? 'short',
      background: data.background ?? null,
      placeholders: data.placeholders,
      required_commands: data.required_commands,
    };
  } catch {
    return null;
  }
}
