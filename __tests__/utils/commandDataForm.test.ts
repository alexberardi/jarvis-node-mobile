import { creatableFields, seedDefaults } from '../../src/utils/commandDataForm';
import type { FieldSpec } from '../../src/api/commandDataApi';

// Mirrors the medication command's editable_fields().
const MED_FIELDS: FieldSpec[] = [
  { name: 'id', type: 'id', editable: false },
  { name: 'name', type: 'string', required: true },
  { name: 'dose', type: 'string' },
  { name: 'dose_times', type: 'array', item_type: 'time' },
  { name: 'recurrence', type: 'enum', enum_values: ['daily', 'weekdays', 'weekends'] },
  { name: 'scope', type: 'enum', enum_values: ['personal', 'household'], editable: false, create_only: true },
  { name: 'user_id', type: 'user_ref', editable: false },
  { name: 'active', type: 'bool', editable: false },
  { name: 'created_at', type: 'datetime', editable: false },
];

describe('creatableFields', () => {
  it('keeps editable fields and create_only fields, drops the rest', () => {
    const names = creatableFields(MED_FIELDS).map((f) => f.name);
    expect(names).toEqual(['name', 'dose', 'dose_times', 'recurrence', 'scope']);
    // server-managed read-only fields are gone
    expect(names).not.toContain('id');
    expect(names).not.toContain('user_id');
    expect(names).not.toContain('active');
    expect(names).not.toContain('created_at');
  });

  it('renders create_only fields as editable on the add form', () => {
    const scope = creatableFields(MED_FIELDS).find((f) => f.name === 'scope');
    expect(scope?.editable).toBe(true);
  });

  it('does not mutate the original specs', () => {
    creatableFields(MED_FIELDS);
    const scope = MED_FIELDS.find((f) => f.name === 'scope');
    expect(scope?.editable).toBe(false); // original untouched
  });
});

describe('seedDefaults', () => {
  it('seeds type-appropriate empties + enum first value', () => {
    const seed = seedDefaults(MED_FIELDS);
    expect(seed).toEqual({
      name: '',
      dose: '',
      dose_times: [],
      recurrence: 'daily',
      scope: 'personal', // first enum value => most private default
    });
  });

  it('omits non-creatable fields from the seed', () => {
    const seed = seedDefaults(MED_FIELDS);
    expect(seed).not.toHaveProperty('id');
    expect(seed).not.toHaveProperty('user_id');
  });
});
