/**
 * Generic interactive list screen.
 *
 * Landing page for interactive_list inbox items — the one server-driven
 * UI surface (prds/generic-interactive-view.md). Renders any command's
 * payload from the item metadata: sections of rows with selection
 * controls, record-field gating with live re-fetch, webview_pick row
 * actions, and 1-6 bottom actions that fire the named @callback on the
 * source node carrying the collected state. Polls the callback status
 * until the result lands, then renders the standardized result
 * affordances (message / url / text / detail_lines).
 */
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Clipboard from 'expo-clipboard';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ActivityIndicator,
  Button,
  Checkbox,
  Chip,
  Divider,
  Icon,
  IconButton,
  List,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';

import {
  getInteractiveCallbackStatus,
  sendInteractiveCallback,
} from '../../api/commandCenterApi';
import { listRecords } from '../../api/commandDataApi';
import { getInboxItem, InboxItem } from '../../api/inboxApi';
import { useAuth } from '../../auth/AuthContext';
import { InboxStackParamList } from '../../navigation/types';
import {
  ParsedAction,
  ParsedInteractiveList,
  ParsedRow,
  ParsedRowAction,
} from '../../types/interactiveList';
import {
  buildCollectedState,
  compileRowActionPattern,
  computeDefaultQuantities,
  computeDefaultSelection,
  computeRowStates,
  currentActionValue,
  FetchedRecords,
  MAX_QUANTITY,
  parsePayload,
  parseQuantity,
  shouldShowSelectAll,
  substituteLabel,
  substituteUrl,
} from '../../utils/interactiveList';

type Nav = NativeStackNavigationProp<InboxStackParamList>;
type ListRoute = RouteProp<InboxStackParamList, 'InteractiveList'>;

/** context_data shape on a completed callback (decision 7). Unknown keys
 *  are ignored; convention is at most one of url/text. */
interface CallbackResult {
  message?: string;
  url?: string; // auto-opened once on arrival + "Open link" button
  text?: string; // mono block + copy-to-clipboard
  detail_lines?: string[]; // checkmark-icon list rows
}

const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 30_000;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const InteractiveListScreen = () => {
  const route = useRoute<ListRoute>();
  const navigation = useNavigation<Nav>();
  const theme = useTheme();
  const { state: authState } = useAuth();

  const [item, setItem] = useState<InboxItem | null>(null);
  const [payload, setPayload] = useState<ParsedInteractiveList | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [fetched, setFetched] = useState<FetchedRecords>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Text state so mid-edit blanks don't fight the keyboard; parsed on use.
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [callbackError, setCallbackError] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<ParsedAction | null>(null);
  const [result, setResult] = useState<CallbackResult | null>(null);
  const [copied, setCopied] = useState(false);
  // key -> value picked via WebViewPicker this session. Takes precedence
  // over fetched records (the fetch happened before the pick).
  const [overrides, setOverrides] = useState<Record<string, string>>({});

  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  const { itemId, pickedKey, pickedValue } = route.params;

  // Roundtrip return from WebViewPicker: merge the picked value into the
  // gate-override map and auto-select the row so it's immediately usable.
  useEffect(() => {
    if (!pickedKey || !pickedValue) return;
    setOverrides((prev) =>
      prev[pickedKey] === pickedValue ? prev : { ...prev, [pickedKey]: pickedValue },
    );
    setSelected((prev) => {
      if (prev.has(pickedKey)) return prev;
      const next = new Set(prev);
      next.add(pickedKey);
      return next;
    });
  }, [pickedKey, pickedValue]);

  const load = useCallback(async () => {
    if (!authState.accessToken) return;
    try {
      setError(null);
      setLoading(true);
      // Re-targeting a mounted instance (push tap for a different item)
      // replaces params and re-runs load — interaction state from the
      // previous item must not leak into the new one. The WebViewPicker
      // roundtrip doesn't change itemId, so overrides survive it.
      setResult(null);
      setCallbackError(null);
      setLastAction(null);
      setOverrides({});
      const data = await getInboxItem(itemId);
      if (!mountedRef.current) return;
      const parsed = parsePayload(data.metadata);
      if ('invalid' in parsed) {
        // Malformed payload — never crash; the generic detail view can
        // always render the item's plain body.
        navigation.replace('InboxDetail', { itemId });
        return;
      }
      setItem(data);
      setPayload(parsed.payload);
      setTruncated(parsed.truncated);

      // One listRecords call per distinct gate command. A failed call
      // degrades: rows gated on that command render disabled (gate state
      // unknown ⇒ unmet), everything else works.
      const gateCommands = new Set<string>();
      for (const section of parsed.payload.sections) {
        for (const row of section.rows) {
          if (row.requires_record_field) {
            gateCommands.add(row.requires_record_field.command_name);
          }
        }
      }
      const nodeId = parsed.payload.node_id;
      const fetchedMap: FetchedRecords = {};
      await Promise.all(
        Array.from(gateCommands).map(async (commandName) => {
          if (!nodeId) {
            fetchedMap[commandName] = null;
            return;
          }
          try {
            const live = await listRecords(nodeId, commandName);
            fetchedMap[commandName] = Object.fromEntries(
              live.records.map((r) => [r.key, r.data ?? {}]),
            );
          } catch {
            fetchedMap[commandName] = null;
          }
        }),
      );
      if (!mountedRef.current) return;
      setFetched(fetchedMap);
      setSelected(computeDefaultSelection(parsed.payload, fetchedMap, {}));
      setQuantities(computeDefaultQuantities(parsed.payload));
    } catch {
      if (mountedRef.current) setError('Could not load item');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [authState.accessToken, itemId, navigation]);

  useEffect(() => {
    load();
  }, [load]);

  const rowStates = useMemo(
    () => (payload ? computeRowStates(payload, fetched, overrides) : {}),
    [payload, fetched, overrides],
  );

  const selectableKeys = useMemo(() => {
    if (!payload) return [];
    const keys: string[] = [];
    for (const section of payload.sections) {
      for (const row of section.rows) {
        if (rowStates[row.key]?.selectable) keys.push(row.key);
      }
    }
    return keys;
  }, [payload, rowStates]);

  const allSelected =
    selectableKeys.length > 0 && selected.size === selectableKeys.length;

  const toggleSelected = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectableKeys));
    }
  }, [allSelected, selectableKeys]);

  const setQuantityText = useCallback((key: string, text: string) => {
    const digitsOnly = text.replace(/[^0-9]/g, '').slice(0, 2);
    setQuantities((prev) => ({ ...prev, [key]: digitsOnly }));
  }, []);

  const bumpQuantity = useCallback((key: string, delta: number) => {
    setQuantities((prev) => {
      const next = Math.max(
        1,
        Math.min(parseQuantity(prev[key]) + delta, MAX_QUANTITY),
      );
      return { ...prev, [key]: String(next) };
    });
  }, []);

  const openUrl = useCallback((url: string) => {
    Linking.openURL(url).catch(() =>
      Alert.alert('Error', 'Could not open the link.'),
    );
  }, []);

  const onCopyText = useCallback(async () => {
    if (!result?.text) return;
    try {
      await Clipboard.setStringAsync(result.text);
    } catch {
      Alert.alert('Error', 'Could not copy to clipboard.');
      return;
    }
    setCopied(true);
    setTimeout(() => {
      if (mountedRef.current) setCopied(false);
    }, 2000);
  }, [result]);

  const runAction = useCallback(
    async (action: ParsedAction) => {
      if (!payload) return;
      const nodeId = payload.node_id;
      if (!nodeId) {
        Alert.alert('Error', 'No node id on this item');
        return;
      }

      setLastAction(action);
      setCallbackError(null);
      setBusy(true);
      try {
        const response = await sendInteractiveCallback({
          command_name: payload.command_name,
          callback_name: action.callback,
          data: {
            action: action.callback,
            selected: buildCollectedState(payload, selected, quantities),
            // Producer-set opaque context, echoed verbatim ({} if absent).
            context: payload.context,
          },
          target_node_id: nodeId,
          navigation_type: 'stack',
        });

        const startedAt = Date.now();
        for (;;) {
          await sleep(POLL_INTERVAL_MS);
          if (!mountedRef.current) return;
          const status = await getInteractiveCallbackStatus(response.id);
          if (status.status === 'pending') {
            // Bound the wait — a stuck job shouldn't spin forever.
            if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
              throw new Error('Timed out waiting for the result.');
            }
            continue;
          }
          if (status.status !== 'completed') {
            throw new Error(
              status.status === 'expired'
                ? 'This request expired.'
                : status.error_message || 'Action failed.',
            );
          }
          const callbackResult = (status.context_data ?? {}) as CallbackResult;
          if (!mountedRef.current) return;
          setResult(callbackResult);
          if (typeof callbackResult.url === 'string' && callbackResult.url) {
            openUrl(callbackResult.url);
          }
          return;
        }
      } catch (err: unknown) {
        if (mountedRef.current) {
          setCallbackError(err instanceof Error ? err.message : 'Action failed.');
        }
      } finally {
        if (mountedRef.current) setBusy(false);
      }
    },
    [payload, selected, quantities, openUrl],
  );

  const header = (
    <View style={[styles.header, { backgroundColor: theme.colors.background }]}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
        <Icon source="arrow-left" size={24} color={theme.colors.onSurface} />
        <Text variant="bodyLarge" style={{ color: theme.colors.onSurface, marginLeft: 8 }}>
          Inbox
        </Text>
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error || !item || !payload) {
    return (
      <View style={styles.center}>
        <Text variant="bodyLarge" style={{ color: theme.colors.error }}>
          {error || 'Item not found'}
        </Text>
        <Button mode="text" onPress={load} style={{ marginTop: 8 }}>
          Retry
        </Button>
      </View>
    );
  }

  if (result) {
    const detailLines = Array.isArray(result.detail_lines)
      ? result.detail_lines.filter((line): line is string => typeof line === 'string')
      : [];
    return (
      <View style={styles.container}>
        {header}
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.successHeader}>
            <Icon source="check-circle" size={48} color={theme.colors.primary} />
            <Text variant="headlineSmall" style={styles.heading}>
              Complete
            </Text>
          </View>
          {typeof result.message === 'string' && result.message ? (
            <Text
              variant="bodyMedium"
              style={[styles.successMessage, { color: theme.colors.onSurfaceVariant }]}
            >
              {result.message}
            </Text>
          ) : null}
          {typeof result.text === 'string' && result.text ? (
            <Text
              selectable
              variant="bodyMedium"
              style={[
                styles.textBlock,
                {
                  backgroundColor: theme.colors.surfaceVariant,
                  color: theme.colors.onSurfaceVariant,
                },
              ]}
            >
              {result.text}
            </Text>
          ) : null}
          {detailLines.length > 0 && (
            <>
              <Divider style={{ marginBottom: 8 }} />
              {detailLines.map((line, index) => (
                <View key={`${index}-${line}`} style={styles.detailRow}>
                  <Icon source="check" size={16} color={theme.colors.primary} />
                  <Text variant="bodyMedium" style={{ marginLeft: 8 }}>
                    {line}
                  </Text>
                </View>
              ))}
            </>
          )}
          <View style={styles.resultActions}>
            {typeof result.url === 'string' && result.url ? (
              <Button
                testID="open-link-button"
                mode="contained"
                icon="open-in-new"
                onPress={() => openUrl(result.url!)}
              >
                Open link
              </Button>
            ) : null}
            {typeof result.text === 'string' && result.text ? (
              <Button
                testID="copy-to-clipboard-button"
                mode="contained"
                icon={copied ? 'check' : 'content-copy'}
                onPress={onCopyText}
              >
                {copied ? 'Copied' : 'Copy to clipboard'}
              </Button>
            ) : null}
            <Button mode="text" onPress={() => navigation.goBack()}>
              Done
            </Button>
          </View>
        </ScrollView>
      </View>
    );
  }

  const sourceNodeId = payload.node_id;

  const renderRowAction = (row: ParsedRow, action: ParsedRowAction, index: number) => {
    if (action.type !== 'webview_pick') {
      // Forward compat: unknown row-action types render as disabled text.
      return (
        <Button key={`${row.key}-action-${index}`} compact mode="text" disabled>
          {action.label}
        </Button>
      );
    }
    if (!sourceNodeId || !action.start_url || !action.pattern || !action.save) {
      return null;
    }
    // Invalid pattern regex ⇒ the row action is unrenderable.
    if (compileRowActionPattern(action.pattern) === null) return null;
    const value = currentActionValue(row, action, fetched, overrides);
    // A {value} URL is hidden when no current value exists.
    const startUrl = substituteUrl(action.start_url, { label: row.label, value });
    if (startUrl === null) return null;
    return (
      <Button
        key={`${row.key}-action-${index}`}
        compact
        mode="text"
        disabled={busy}
        onPress={() =>
          navigation.navigate('WebViewPicker', {
            itemId,
            rowKey: row.key,
            nodeId: sourceNodeId,
            commandName: action.save!.command_name,
            field: action.save!.field,
            startUrl,
            pattern: action.pattern!,
            currentValue: value ?? undefined,
          })
        }
      >
        {action.label}
      </Button>
    );
  };

  const renderRow = (row: ParsedRow) => {
    const state = rowStates[row.key];
    if (!state) return null;
    const checked = state.selectable && selected.has(row.key);
    const muted = !state.enabled;
    return (
      <React.Fragment key={row.key}>
        <TouchableOpacity
          testID={`interactive-row-${row.key}`}
          style={styles.itemRow}
          onPress={() => toggleSelected(row.key)}
          disabled={!state.selectable || busy}
        >
          {!state.unknownControl && row.control !== 'none' && (
            <Checkbox
              status={checked ? 'checked' : 'unchecked'}
              disabled={!state.selectable || busy}
              onPress={() => toggleSelected(row.key)}
            />
          )}
          <View style={styles.itemInfo}>
            <Text
              variant="bodyLarge"
              style={muted ? { color: theme.colors.onSurfaceVariant } : undefined}
            >
              {row.label}
            </Text>
            {state.caption || row.row_actions.length > 0 ? (
              <View style={styles.captionRow}>
                {state.caption ? (
                  <Text
                    variant="bodySmall"
                    style={{ color: theme.colors.onSurfaceVariant }}
                  >
                    {state.caption}
                  </Text>
                ) : null}
                {row.row_actions.map((action, index) =>
                  renderRowAction(row, action, index),
                )}
              </View>
            ) : null}
          </View>
          {/* Stepper (decision 8) — only visible while the row is enabled. */}
          {row.control === 'checkbox_stepper' && state.enabled && (
            <View style={styles.stepper}>
              <IconButton
                testID={`quantity-minus-${row.key}`}
                icon="minus"
                size={16}
                disabled={busy || parseQuantity(quantities[row.key]) <= 1}
                onPress={() => bumpQuantity(row.key, -1)}
              />
              <TextInput
                testID={`quantity-input-${row.key}`}
                mode="outlined"
                dense
                value={quantities[row.key] ?? '1'}
                onChangeText={(text) => setQuantityText(row.key, text)}
                onBlur={() =>
                  setQuantityText(
                    row.key,
                    String(parseQuantity(quantities[row.key])),
                  )
                }
                keyboardType="number-pad"
                disabled={busy}
                style={styles.quantityInput}
                contentStyle={styles.quantityInputContent}
              />
              <IconButton
                testID={`quantity-plus-${row.key}`}
                icon="plus"
                size={16}
                disabled={busy || parseQuantity(quantities[row.key]) >= MAX_QUANTITY}
                onPress={() => bumpQuantity(row.key, 1)}
              />
            </View>
          )}
        </TouchableOpacity>
        <Divider />
      </React.Fragment>
    );
  };

  const renderActionButton = (action: ParsedAction, index: number) => {
    const label =
      callbackError && lastAction === action
        ? 'Retry'
        : substituteLabel(action.label, selected.size);
    // Disabled-when-empty-selection only applies when there is something
    // to select — info/approve-reject lists keep their actions enabled.
    const disabled = busy || (selectableKeys.length > 0 && selected.size === 0);
    const shared = {
      onPress: () => runAction(action),
      loading: busy && lastAction === action,
      disabled,
      style: payload.actions.length <= 2 ? styles.actionButton : undefined,
    };
    if (action.style === 'secondary') {
      return (
        <Button key={`action-${index}`} mode="outlined" {...shared}>
          {label}
        </Button>
      );
    }
    if (action.style === 'destructive') {
      return (
        <Button
          key={`action-${index}`}
          mode="contained"
          buttonColor={theme.colors.error}
          textColor={theme.colors.onError}
          {...shared}
        >
          {label}
        </Button>
      );
    }
    return (
      <Button key={`action-${index}`} mode="contained" {...shared}>
        {label}
      </Button>
    );
  };

  const totalRows = payload.sections.reduce(
    (count, section) => count + section.rows.length,
    0,
  );
  const showSelectHeader = shouldShowSelectAll(payload, rowStates);

  // Zero rows total: producers use this for "list was empty" — render
  // empty_text centered and hide the action bar (not the fallback).
  if (totalRows === 0) {
    return (
      <View style={styles.container}>
        {header}
        <View style={styles.titleBlock}>
          <Chip compact style={styles.chip} textStyle={styles.chipText}>
            {item.category.replace(/_/g, ' ')}
          </Chip>
          <Text variant="headlineSmall" style={styles.heading}>
            {payload.title_override ?? item.title}
          </Text>
        </View>
        <View style={styles.center}>
          <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant }}>
            {payload.empty_text ?? 'Nothing here yet.'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {header}

      <View style={styles.titleBlock}>
        <Chip compact style={styles.chip} textStyle={styles.chipText}>
          {item.category.replace(/_/g, ' ')}
        </Chip>
        <Text variant="headlineSmall" style={styles.heading}>
          {payload.title_override ?? item.title}
        </Text>
        {showSelectHeader && (
          <View style={styles.selectRow}>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              {selected.size} of {selectableKeys.length} selected
            </Text>
            <Button
              testID="select-all-toggle"
              compact
              mode="text"
              onPress={toggleSelectAll}
              disabled={selectableKeys.length === 0 || busy}
            >
              {allSelected ? 'Clear' : 'All'}
            </Button>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.listContent}>
        {payload.sections.map((section, index) => {
          if (section.rows.length === 0) return null;
          return (
            <List.Section key={`section-${index}`}>
              {section.title ? <List.Subheader>{section.title}</List.Subheader> : null}
              {section.rows.map(renderRow)}
            </List.Section>
          );
        })}
        {truncated && (
          <Text
            variant="bodySmall"
            style={[styles.truncationNotice, { color: theme.colors.onSurfaceVariant }]}
          >
            Some content was truncated.
          </Text>
        )}
      </ScrollView>

      <View style={styles.bottomActions}>
        {busy && (
          <View style={styles.progressRow}>
            <ActivityIndicator size="small" />
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.onSurfaceVariant, marginLeft: 8 }}
            >
              Working…
            </Text>
          </View>
        )}
        {callbackError && (
          <Text
            variant="bodySmall"
            style={[styles.errorText, { color: theme.colors.error }]}
          >
            {callbackError}
          </Text>
        )}
        <View
          style={payload.actions.length <= 2 ? styles.actionRow : styles.actionStack}
        >
          {payload.actions.map(renderActionButton)}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: { flexDirection: 'row', alignItems: 'center' },
  content: { padding: 16, paddingBottom: 48 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  titleBlock: { paddingHorizontal: 16 },
  heading: { fontWeight: 'bold', marginTop: 8, marginBottom: 4 },
  chip: { alignSelf: 'flex-start' },
  chipText: { fontSize: 10, lineHeight: 14 },
  selectRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  listContent: { paddingBottom: 16, flexGrow: 1 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  itemInfo: { flex: 1, marginLeft: 4 },
  captionRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  stepper: { flexDirection: 'row', alignItems: 'center' },
  quantityInput: { width: 52, height: 36, textAlign: 'center' },
  quantityInputContent: { textAlign: 'center', paddingHorizontal: 4 },
  truncationNotice: { textAlign: 'center', marginTop: 8, marginBottom: 8 },
  bottomActions: { padding: 16, gap: 8 },
  actionRow: { flexDirection: 'row', gap: 8 },
  actionStack: { gap: 8 },
  actionButton: { flex: 1 },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  errorText: { textAlign: 'center' },
  successHeader: { alignItems: 'center', marginTop: 16, marginBottom: 8 },
  successMessage: { textAlign: 'center', marginBottom: 16 },
  textBlock: {
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  resultActions: { marginTop: 32, gap: 8 },
});

export default InteractiveListScreen;
