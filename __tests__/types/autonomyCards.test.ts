import { parseRanCard } from '../../src/types/autonomyCards';

const sample = {
  household_id: 'hh',
  card_type: 'autonomy_ran',
  state: 'running',
  workflow_id: 'wf_1',
  plan_id: 'pl_1',
  source: { kind: 'errand', label: 'Errand' },
  steps: [
    { label: 'Search the web', command: 'quick_search', status: 'ok', result: '5 results' },
    { label: 'Send it', command: 'send_email', status: 'pending', result: '' },
  ],
  rules: [
    {
      tool: 'quick_search',
      effect: 'allow',
      scope: 'tool',
      rule_id: null,
      note: '',
      reason: 'the tool declares run_without_confirmation',
    },
  ],
  interactive_elements: [],
};

describe('parseRanCard', () => {
  it('returns null without card_type', () => {
    const { card_type, ...rest } = sample;
    expect(parseRanCard(rest)).toBeNull();
    expect(parseRanCard(null)).toBeNull();
    expect(parseRanCard({ ...sample, card_type: 'watch_alert' })).toBeNull();
  });

  it('returns null when steps is not an array', () => {
    expect(parseRanCard({ ...sample, steps: 'nope' })).toBeNull();
    expect(parseRanCard({ ...sample, steps: undefined })).toBeNull();
  });

  it('parses a full sample', () => {
    expect(parseRanCard(sample)).toEqual({
      state: 'running',
      source: { kind: 'errand', label: 'Errand' },
      steps: [
        { label: 'Search the web', command: 'quick_search', status: 'ok', result: '5 results' },
        { label: 'Send it', command: 'send_email', status: 'pending', result: '' },
      ],
      rules: [
        {
          tool: 'quick_search',
          effect: 'allow',
          scope: 'tool',
          rule_id: null,
          note: '',
          reason: 'the tool declares run_without_confirmation',
        },
      ],
    });
  });

  it('defaults missing rules to []', () => {
    const { rules, ...rest } = sample;
    expect(parseRanCard(rest)?.rules).toEqual([]);
  });

  it('maps an unknown step status to pending', () => {
    const card = parseRanCard({
      ...sample,
      steps: [{ label: 'x', command: 'x', status: 'exploded', result: '' }],
    });
    expect(card?.steps[0].status).toBe('pending');
  });
});
