import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Chip, Icon, Text, useTheme } from 'react-native-paper';

import type { RanCardData, RanStepStatus } from '../../types/autonomyCards';

interface AutonomyRanCardProps {
  data: RanCardData;
}

const STATE_LABELS: Record<string, string> = {
  running: 'Running…',
  waiting: 'Waiting for your OK',
  done: 'Done',
  partial: 'Finished with issues',
  failed: "Couldn't finish",
  stopped: 'Stopped',
};

const SCOPE_LABELS: Record<string, string> = {
  household: 'Household rule',
  watch: 'Watch rule',
  goal: 'Goal rule',
  automation: 'Set on the automation',
  tool: "The tool says it's safe to run without asking",
};

const STEP_ICONS: Record<RanStepStatus, string> = {
  ok: 'check-circle',
  failed: 'close-circle',
  skipped: 'skip-next',
  pending: 'progress-clock',
};

/**
 * "Ran on its own" inbox card (metadata.card_type === 'autonomy_ran'):
 * what ran step by step, where it came from, and which rule allowed it.
 * The Stop button stays with InteractiveElementsSection.
 */
const AutonomyRanCard: React.FC<AutonomyRanCardProps> = ({ data }) => {
  const theme = useTheme();
  const stateLabel = STATE_LABELS[data.state];
  const source =
    data.source.kind === 'automation'
      ? `From: Automation · ${data.source.label}`
      : 'From: Errand';

  const stepColor = (status: RanStepStatus) => {
    switch (status) {
      case 'ok':
        return theme.colors.primary;
      case 'failed':
        return theme.colors.error;
      default:
        return theme.colors.onSurfaceVariant;
    }
  };

  return (
    <View testID="ran-card" style={styles.container}>
      <View style={styles.header}>
        {stateLabel ? (
          <Chip compact style={styles.chip} testID="ran-state">
            {stateLabel}
          </Chip>
        ) : null}
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
          {source}
        </Text>
      </View>

      {data.steps.map((step, i) => (
        <View key={i} testID={`ran-step-${i}`} style={styles.step}>
          <Icon source={STEP_ICONS[step.status]} size={20} color={stepColor(step.status)} />
          <View style={styles.stepText}>
            <Text variant="bodyMedium">{step.label || step.command}</Text>
            {step.result ? (
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {step.result}
              </Text>
            ) : null}
          </View>
        </View>
      ))}

      {data.rules.length > 0 && (
        <View style={[styles.rules, { borderTopColor: theme.colors.outlineVariant }]}>
          <Text variant="titleSmall" style={styles.rulesTitle}>
            Why it was allowed
          </Text>
          {data.rules.map((rule, i) => (
            <View key={i} testID={`ran-rule-${i}`} style={styles.rule}>
              <Text variant="labelLarge">{SCOPE_LABELS[rule.scope] ?? rule.scope}</Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {rule.tool}
              </Text>
              {rule.note ? (
                <Text variant="bodySmall" style={styles.note}>
                  {`“${rule.note}”`}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    alignSelf: 'flex-start',
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  stepText: {
    flex: 1,
  },
  rules: {
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    gap: 8,
  },
  rulesTitle: {
    marginBottom: 2,
  },
  rule: {
    gap: 2,
  },
  note: {
    fontStyle: 'italic',
  },
});

export default AutonomyRanCard;
