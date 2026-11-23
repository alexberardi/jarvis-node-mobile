import { friendlyCommand, routineSummary } from '../../src/screens/Routines/RoutineEditScreen';

const base = {
  mode: 'advanced' as const,
  triggerPhrases: ['good morning', 'start the day'],
  utterance: '',
  steps: [
    { command: 'get_weather', args: [], label: '' },
    { command: 'get_calendar_events', args: [], label: 'Check my calendar' },
  ],
  responseInstruction: 'Give a warm short briefing.',
  responseLength: 'short' as const,
  scheduled: false,
};

describe('routine summary', () => {
  it('names commands for people', () => {
    expect(friendlyCommand('get_weather')).toBe('Get weather');
    expect(friendlyCommand('')).toBe('Choose a command');
  });

  it('reads an advanced routine as one sentence, labels before command names', () => {
    expect(routineSummary(base)).toBe(
      'When you say “good morning” or “start the day”, Jarvis will: get weather, then check my calendar, then give a short reply: Give a warm short briefing.',
    );
  });

  it('reads a described (simple) routine and a schedule', () => {
    expect(routineSummary({ ...base, mode: 'simple', utterance: 'Dim the lights', scheduled: true })).toBe(
      'When you say “good morning” or “start the day”, Jarvis does: Dim the lights. It also runs on a schedule.',
    );
  });

  it('falls back when there are no phrases or steps yet', () => {
    expect(routineSummary({ ...base, triggerPhrases: [], steps: [], responseInstruction: '' })).toBe(
      'When it runs, Jarvis runs the steps you add below.',
    );
    expect(routineSummary({ ...base, triggerPhrases: [], scheduled: true, steps: [], responseInstruction: '' })).toBe(
      'On its schedule, Jarvis runs the steps you add below.',
    );
  });
});
