import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Chip, Text, useTheme } from 'react-native-paper';

import {
  InteractiveCallbackRequest,
  InteractiveElement,
  sendInteractiveCallback,
} from '../api/commandCenterApi';
import type { InboxStackParamList } from '../navigation/types';
import { isExpiryError, type EditorField } from '../utils/inboxEditors';

interface Props {
  elements: InteractiveElement[];
  /** Target node — read from inbox item metadata. Node-plane elements are disabled without it. */
  targetNodeId: string | null;
  /**
   * Household for server-plane elements (el.target === "server") — read from
   * the inbox item itself. Server-plane taps POST household_id and no
   * target_node_id (CC executes the callback; see CC PR #55). Server-plane
   * elements are disabled without it.
   */
  serverHouseholdId?: string | null;
  /** Optional section header shown above the chips (e.g., "Cast", "Similar movies"). */
  title?: string;
  /**
   * Live editable-text merge (see InboxDetailScreen's metadata.editable_text).
   * When set and `dataKey` exists in an element's data, the current editor
   * text replaces data[dataKey] in the callback payload — a "Send reply"
   * chip carries the user's edited draft, while elements whose data lacks
   * the key (e.g. "Ignore") are untouched. Empty editor text blocks those
   * elements with an inline error instead of sending an empty value.
   *
   * Superseded by `editors` for multi-field cards; kept for the shipped
   * single-editor producers. Ignored when `editors` is provided.
   */
  editableText?: { dataKey: string; value: string };
  /**
   * Multi-field editor merge (metadata.editable_fields — see
   * utils/inboxEditors). Same rule as editableText, once per field: an
   * element whose data carries field.data_key gets the live value; a
   * required field with empty text blocks the tap with an inline error.
   */
  editors?: { fields: EditorField[]; values: Record<string, string> };
  /** Force-disable every chip (unsupported-editor guard, expired card). */
  disabled?: boolean;
  /**
   * Called instead of the generic error alert when the POST fails because
   * the underlying plan/job expired (HTTP 410 or an "expired" detail) — the
   * parent renders the expired-card state.
   */
  onExpired?: () => void;
  /** Notified when a callback round-trip starts/ends (lets the parent disable an editor while pending). */
  onPendingChange?: (pending: boolean) => void;
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
 * inbox item's metadata. Tapping one POSTs a callback request to CC:
 * node-plane elements route over MQTT to the target node; server-plane
 * elements (el.target === "server") are executed by CC itself. The follow-up
 * inbox item arrives separately via the normal notifications path.
 */
const InteractiveElementsSection: React.FC<Props> = ({
  elements,
  targetNodeId,
  serverHouseholdId,
  title,
  editableText,
  editors,
  disabled = false,
  onExpired,
  onPendingChange,
}) => {
  const theme = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<InboxStackParamList>>();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [emptyFieldError, setEmptyFieldError] = useState<string | null>(null);

  // Normalize the legacy single-editor prop into the fields shape so the
  // merge rule below has one implementation. Legacy keeps its exact shipped
  // error copy ("Draft is empty").
  const effectiveEditors: { fields: EditorField[]; values: Record<string, string> } | undefined =
    editors ??
    (editableText
      ? {
          fields: [{
            key: editableText.dataKey,
            initial: '',
            data_key: editableText.dataKey,
            input_type: 'multiline',
            required: true,
            legacy: true,
          }],
          values: { [editableText.dataKey]: editableText.value },
        }
      : undefined);

  // Clear the empty-field error as soon as every required live value is set.
  const liveValuesSignature = effectiveEditors
    ? effectiveEditors.fields
        .map((f) => `${f.data_key}=${(effectiveEditors.values[f.data_key] ?? '').trim() ? 1 : 0}`)
        .join(',')
    : '';
  useEffect(() => {
    if (!emptyFieldError || !effectiveEditors) return;
    const anyRequiredEmpty = effectiveEditors.fields.some(
      (f) => f.required && !(effectiveEditors.values[f.data_key] ?? '').trim(),
    );
    if (!anyRequiredEmpty) setEmptyFieldError(null);
    // liveValuesSignature captures the emptiness of every field's live value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveValuesSignature, emptyFieldError]);

  const handlePress = useCallback(
    async (el: InteractiveElement) => {
      const isServerPlane = el.target === 'server';
      if (isServerPlane ? !serverHouseholdId : !targetNodeId) {
        Alert.alert(
          'Error',
          isServerPlane
            ? 'Missing household context for this item'
            : 'Missing node context for this item',
        );
        return;
      }

      // MERGE RULE (per field): when the element's data contains a field's
      // data_key, the live editor value replaces data[data_key] in the
      // callback payload. Elements whose data lacks the key (e.g. "Ignore")
      // are untouched. A required field with empty text blocks the tap.
      let data = el.data;
      if (effectiveEditors) {
        for (const field of effectiveEditors.fields) {
          if (!Object.prototype.hasOwnProperty.call(el.data ?? {}, field.data_key)) {
            continue;
          }
          const value = effectiveEditors.values[field.data_key] ?? '';
          if (field.required && !value.trim()) {
            setEmptyFieldError(
              field.legacy ? 'Draft is empty' : `${field.label ?? field.data_key} is required`,
            );
            return;
          }
          data = { ...data, [field.data_key]: value };
        }
      }
      setEmptyFieldError(null);

      // Default to "new_notification" — back-compat with elements that
      // predate the navigation_type field.
      const nav = el.navigation_type ?? 'new_notification';

      const request: InteractiveCallbackRequest = {
        command_name: el.command,
        callback_name: el.callback,
        data,
        navigation_type: nav,
        ...(isServerPlane
          ? { household_id: serverHouseholdId as string }
          : { target_node_id: targetNodeId as string }),
      };

      setPendingId(el.id);
      onPendingChange?.(true);
      try {
        const response = await sendInteractiveCallback(request);

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
            targetNodeId: targetNodeId ?? undefined,
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
        if (onExpired && isExpiryError(err)) {
          onExpired();
        } else {
          Alert.alert(
            'Could not send',
            err instanceof Error ? err.message : 'Unknown error',
          );
        }
      } finally {
        setPendingId(null);
        onPendingChange?.(false);
      }
    },
    [navigation, targetNodeId, serverHouseholdId, effectiveEditors, onExpired, onPendingChange],
  );

  if (elements.length === 0) return null;

  return (
    <View style={styles.container}>
      {title ? (
        <Text variant="titleSmall" style={styles.title}>
          {title}
        </Text>
      ) : null}
      {emptyFieldError ? (
        <Text variant="bodySmall" style={[styles.emptyError, { color: theme.colors.error }]}>
          {emptyFieldError}
        </Text>
      ) : null}
      <View style={styles.chipRow}>
        {elements.map((el) => {
          const text = el.sublabel ? `${el.label} · ${el.sublabel}` : el.label;
          const isPending = pendingId === el.id;
          const isSent = sentIds.has(el.id);
          const noContext =
            el.target === 'server' ? !serverHouseholdId : !targetNodeId;
          // Disable all chips while any tap is in flight; once sent, the chip
          // stays disabled to prevent double-fire while we wait for the
          // follow-up inbox item to appear.
          const chipDisabled =
            disabled || noContext || isSent || (pendingId !== null && !isPending);
          const icon = isSent ? 'check' : isPending ? 'progress-clock' : iconForKind(el.kind);
          return (
            <Chip
              key={el.id}
              icon={icon}
              onPress={chipDisabled ? undefined : () => handlePress(el)}
              disabled={chipDisabled}
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
  emptyError: {
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
