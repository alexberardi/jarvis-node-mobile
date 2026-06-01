import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Chip, Text, useTheme } from 'react-native-paper';

import {
  InteractiveElement,
  sendInteractiveCallback,
} from '../api/commandCenterApi';
import type { InboxStackParamList } from '../navigation/types';

interface Props {
  elements: InteractiveElement[];
  /** Target node — read from inbox item metadata. If missing, taps are disabled. */
  targetNodeId: string | null;
  /** Optional section header shown above the chips (e.g., "Cast", "Similar movies"). */
  title?: string;
}

const iconForKind = (kind: string | undefined): string | undefined => {
  switch (kind) {
    case 'actor': return 'account';
    case 'director': return 'movie-roll';
    case 'movie': return 'movie';
    default: return undefined;
  }
};

/**
 * Renders an array of tappable interactive elements (chips) embedded in the
 * inbox item's metadata. Tapping one POSTs a callback request to CC, which
 * routes through MQTT to the target node and dispatches to the command's
 * @callback method. The follow-up inbox item arrives separately via the
 * normal notifications path.
 */
const InteractiveElementsSection: React.FC<Props> = ({
  elements,
  targetNodeId,
  title,
}) => {
  const theme = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<InboxStackParamList>>();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());

  const handlePress = useCallback(
    async (el: InteractiveElement) => {
      if (!targetNodeId) {
        Alert.alert('Error', 'Missing node context for this item');
        return;
      }
      // Default to "new_notification" — back-compat with elements that
      // predate the navigation_type field.
      const nav = el.navigation_type ?? 'new_notification';

      setPendingId(el.id);
      try {
        const response = await sendInteractiveCallback({
          command_name: el.command,
          callback_name: el.callback,
          data: el.data,
          target_node_id: targetNodeId,
          navigation_type: nav,
        });

        if (nav === 'stack' || nav === 'popover') {
          // "popover" not implemented yet — falls through to the stack
          // push for now so the result is at least reachable. When a
          // real use-case lands, present a modal sheet here instead
          // and let "stack" keep the navigation.push path.
          //
          // Either way: push the result screen — it polls and renders
          // inline. The chip stays disabled until the user comes back,
          // but doesn't get the "sent" check mark since we're not in
          // fire-and-forget mode.
          navigation.push('InboxCallbackResult', {
            jobId: response.id,
            title: el.label,
            targetNodeId,
          });
        } else {
          // "new_notification" — async; mark sent so the chip dims and
          // the user knows the result will land in the inbox later.
          setSentIds((prev) => {
            const next = new Set(prev);
            next.add(el.id);
            return next;
          });
        }
      } catch (err: unknown) {
        Alert.alert(
          'Could not send',
          err instanceof Error ? err.message : 'Unknown error',
        );
      } finally {
        setPendingId(null);
      }
    },
    [navigation, targetNodeId],
  );

  if (elements.length === 0) return null;

  const noContext = !targetNodeId;

  return (
    <View style={styles.container}>
      {title ? (
        <Text variant="titleSmall" style={styles.title}>
          {title}
        </Text>
      ) : null}
      <View style={styles.chipRow}>
        {elements.map((el) => {
          const text = el.sublabel ? `${el.label} · ${el.sublabel}` : el.label;
          const isPending = pendingId === el.id;
          const isSent = sentIds.has(el.id);
          // Disable all chips while any tap is in flight; once sent, the chip
          // stays disabled to prevent double-fire while we wait for the
          // follow-up inbox item to appear.
          const disabled = noContext || isSent || (pendingId !== null && !isPending);
          const icon = isSent ? 'check' : isPending ? 'progress-clock' : iconForKind(el.kind);
          return (
            <Chip
              key={el.id}
              icon={icon}
              onPress={disabled ? undefined : () => handlePress(el)}
              disabled={disabled}
              style={[
                styles.chip,
                isSent && { backgroundColor: theme.colors.surfaceVariant },
              ]}
            >
              {text}
            </Chip>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
  },
  title: {
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    marginVertical: 2,
  },
});

export default InteractiveElementsSection;
