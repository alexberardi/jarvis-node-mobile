/** Names and icons for people, shared by Pantry, routines and credentials. */

/** A command's name for people: get_weather → "Get weather". */
export const friendlyCommand = (command: string): string =>
  command ? command.charAt(0).toUpperCase() + command.slice(1).replace(/_/g, ' ') : 'Choose a command';

/** A Pantry category for people: smart-home → "Smart home". */
export const categoryLabel = (category: string): string => {
  const s = category.replace(/[-_]/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const CATEGORY_ICONS: Record<string, string> = {
  'smart-home': 'home-automation',
  media: 'music-note',
  information: 'newspaper-variant-outline',
  productivity: 'calendar-check',
  calendar: 'calendar',
  communication: 'message-outline',
  utilities: 'tools',
  entertainment: 'gamepad-variant-outline',
};

export const categoryIcon = (category?: string): string =>
  (category && CATEGORY_ICONS[category]) || 'package-variant';

/** What each kind of package component adds, in plain words. */
export const COMPONENT_LABELS: Record<string, string> = {
  command: 'Voice command',
  agent: 'Runs in the background',
  device_protocol: 'Talks to a kind of device',
  device_manager: 'Brings in devices from another hub',
  prompt_provider: 'Changes how Jarvis thinks',
};
