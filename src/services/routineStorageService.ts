import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Routine } from '../types/Routine';

const STORAGE_KEY = 'jarvis_routines';
const SEEDED_KEY = 'jarvis_routines_seeded_v2';

const DEFAULT_ROUTINES: Routine[] = [
  // On-demand defaults
  {
    id: 'good_morning',
    name: 'Good Morning',
    trigger_phrases: ['good morning', 'morning routine', 'start my day'],
    steps: [
      { command: 'control_device', args: [{ key: 'floor', value: 'Downstairs' }, { key: 'action', value: 'turn_on' }], label: 'lights' },
      { command: 'get_weather', args: [{ key: 'resolved_datetimes', value: 'today' }], label: 'weather' },
      { command: 'get_calendar_events', args: [{ key: 'resolved_datetimes', value: 'today' }], label: 'calendar' },
    ],
    response_instruction: 'Give a cheerful morning briefing with weather and calendar highlights.',
    response_length: 'short',
    background: null,
  },
  {
    id: 'good_night',
    name: 'Good Night',
    trigger_phrases: ['good night', 'bedtime', 'going to bed', 'time for bed'],
    steps: [
      { command: 'control_device', args: [{ key: 'floor', value: 'Downstairs' }, { key: 'action', value: 'turn_off' }], label: 'lights' },
      { command: 'get_calendar_events', args: [{ key: 'resolved_datetimes', value: 'tomorrow' }], label: 'tomorrow' },
    ],
    response_instruction: "Brief goodnight with tomorrow's first appointment if any.",
    response_length: 'short',
    background: null,
  },
  {
    id: 'morning_briefing',
    name: 'Morning Briefing',
    trigger_phrases: ['morning briefing', 'daily briefing', 'give me my briefing', "what's happening today", 'catch me up', 'daily update'],
    steps: [
      { command: 'get_weather', args: [{ key: 'resolved_datetimes', value: 'today' }], label: 'weather' },
      { command: 'get_calendar_events', args: [{ key: 'resolved_datetimes', value: 'today' }], label: 'calendar' },
      { command: 'get_news', args: [{ key: 'category', value: 'general' }, { key: 'count', value: '3' }], label: 'news' },
    ],
    response_instruction: 'Deliver a morning briefing in a natural, flowing narrative style. Start with today\'s weather, then mention calendar events, then summarize the top news headlines. Sound like a personal news anchor, not a list of bullet points.',
    response_length: 'medium',
    background: null,
  },
  // Background defaults
  {
    id: 'news_alerts',
    name: 'News Alerts',
    trigger_phrases: ['news update'],
    steps: [
      { command: 'get_news', args: [{ key: 'category', value: 'general' }, { key: 'count', value: '5' }], label: 'news' },
    ],
    response_instruction: 'Summarize the latest headlines.',
    response_length: 'short',
    background: {
      enabled: true,
      schedule_type: 'interval',
      interval_minutes: 30,
      run_on_startup: true,
      days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      time: '08:00',
      summary_style: 'compact',
      alert_priority: 1,
      alert_ttl_minutes: 240,
    },
  },
  {
    id: 'calendar_check',
    name: 'Calendar Check',
    trigger_phrases: ['calendar check'],
    steps: [
      { command: 'get_calendar_events', args: [{ key: 'resolved_datetimes', value: 'today' }], label: 'calendar' },
    ],
    response_instruction: 'Mention upcoming events and how soon they are.',
    response_length: 'short',
    background: {
      enabled: true,
      schedule_type: 'interval',
      interval_minutes: 5,
      run_on_startup: true,
      days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      time: '08:00',
      summary_style: 'compact',
      alert_priority: 2,
      alert_ttl_minutes: 30,
    },
  },
];

export const slugify = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

/**
 * Seed default routines on first launch (or after v2 schema change), then load from storage.
 */
export const loadRoutines = async (): Promise<Routine[]> => {
  const seeded = await AsyncStorage.getItem(SEEDED_KEY);
  if (!seeded) {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_ROUTINES));
    await AsyncStorage.setItem(SEEDED_KEY, '1');
    return DEFAULT_ROUTINES;
  }

  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Routine[];
  } catch {
    return [];
  }
};

export const saveRoutines = async (routines: Routine[]): Promise<void> => {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(routines));
};

export const getRoutine = async (id: string): Promise<Routine | undefined> => {
  const routines = await loadRoutines();
  return routines.find((r) => r.id === id);
};

export const saveRoutine = async (routine: Routine): Promise<void> => {
  const routines = await loadRoutines();
  const idx = routines.findIndex((r) => r.id === routine.id);
  if (idx >= 0) {
    routines[idx] = routine;
  } else {
    routines.push(routine);
  }
  await saveRoutines(routines);
};

export const deleteRoutine = async (id: string): Promise<void> => {
  const routines = await loadRoutines();
  await saveRoutines(routines.filter((r) => r.id !== id));
};
