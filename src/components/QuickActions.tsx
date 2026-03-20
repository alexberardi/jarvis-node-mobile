import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Chip, Text, useTheme } from 'react-native-paper';

interface QuickAction {
  label: string;
  icon: string;
  prompt: string;
  toolName: string;
}

// Curated quick actions mapped to tool names.
// Only shown if the corresponding tool is loaded on the node.
const ALL_QUICK_ACTIONS: QuickAction[] = [
  { label: 'Weather', icon: 'weather-partly-cloudy', prompt: "What's the weather?", toolName: 'get_weather' },
  { label: 'Set a timer', icon: 'timer-outline', prompt: 'Set a timer for 5 minutes', toolName: 'set_timer' },
  { label: 'Email', icon: 'email-outline', prompt: 'Check my email', toolName: 'email' },
  { label: 'Sports scores', icon: 'scoreboard-outline', prompt: "What are today's sports scores?", toolName: 'get_sports_scores' },
  { label: 'Calendar', icon: 'calendar-outline', prompt: "What's on my calendar today?", toolName: 'get_calendar' },
  { label: 'Lights', icon: 'lightbulb-outline', prompt: 'Turn on the lights', toolName: 'control_device' },
  { label: 'Calculate', icon: 'calculator-variant-outline', prompt: 'What is 15% of 85?', toolName: 'calculate' },
  { label: 'Jokes', icon: 'emoticon-happy-outline', prompt: 'Tell me a joke', toolName: 'jokes' },
  { label: 'Timers', icon: 'timer-check-outline', prompt: 'Check my timers', toolName: 'check_timers' },
  { label: 'News', icon: 'newspaper-variant-outline', prompt: "What's in the news today?", toolName: 'get_news' },
  { label: 'Bluetooth', icon: 'bluetooth', prompt: 'Bluetooth status', toolName: 'bluetooth' },
  { label: 'Research', icon: 'magnify', prompt: 'Research the best coffee beans', toolName: 'deep_research' },
  { label: 'Remember', icon: 'brain', prompt: 'Remember that I like my coffee black', toolName: 'remember' },
];

interface QuickActionsProps {
  /** Tool names available on the selected node (from cached tools). */
  availableTools: string[];
  onSelect: (prompt: string) => void;
}

const QuickActions: React.FC<QuickActionsProps> = ({ availableTools, onSelect }) => {
  const theme = useTheme();

  // Filter to only show actions for tools the node has
  const available = ALL_QUICK_ACTIONS.filter((a) =>
    availableTools.includes(a.toolName),
  );

  // Always include these server-side tools (not in node tools list)
  const serverActions = ALL_QUICK_ACTIONS.filter((a) =>
    ['deep_research', 'remember'].includes(a.toolName),
  );
  const combined = [
    ...available,
    ...serverActions.filter((s) => !available.some((a) => a.toolName === s.toolName)),
  ].slice(0, 8); // Max 8 chips

  if (combined.length === 0) return null;

  return (
    <View style={styles.container}>
      <Text variant="bodyLarge" style={[styles.title, { color: theme.colors.outline }]}>
        Ask Jarvis anything
      </Text>
      <ScrollView
        contentContainerStyle={styles.chipContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.chipGrid}>
          {combined.map((action) => (
            <Chip
              key={action.toolName}
              icon={action.icon}
              mode="outlined"
              compact
              onPress={() => onSelect(action.prompt)}
              style={[styles.chip, { borderColor: theme.colors.outlineVariant }]}
              textStyle={{ fontSize: 13 }}
            >
              {action.label}
            </Chip>
          ))}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  title: {
    marginBottom: 20,
  },
  chipContainer: {
    alignItems: 'center',
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    maxWidth: 340,
  },
  chip: {
    borderRadius: 20,
  },
});

export default QuickActions;
