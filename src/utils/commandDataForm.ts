/**
 * Pure helpers for the command-data create form. Kept out of the screen so
 * they're unit-testable without the React Native render tree.
 */
import type { FieldSpec } from '../api/commandDataApi';

/** Fields shown on the CREATE form: editable fields plus create_only fields
 *  (rendered editable). Server-managed read-only fields (id, owner, active,
 *  created_at) are omitted from the add form entirely. */
export const creatableFields = (fields: FieldSpec[]): FieldSpec[] =>
  fields
    .filter((f) => f.editable !== false || f.create_only)
    .map((f) => (f.create_only ? { ...f, editable: true } : f));

/** Initial form values for a new record, keyed by field name. */
export const seedDefaults = (fields: FieldSpec[]): Record<string, unknown> => {
  const seed: Record<string, unknown> = {};
  for (const f of creatableFields(fields)) {
    if (f.type === 'array') seed[f.name] = [];
    else if (f.type === 'bool') seed[f.name] = false;
    else if (f.type === 'enum' && f.enum_values && f.enum_values.length > 0) {
      seed[f.name] = f.enum_values[0];
    } else seed[f.name] = '';
  }
  return seed;
};
