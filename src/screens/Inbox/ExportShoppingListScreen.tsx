/**
 * Shopping list export screen.
 *
 * Landing page for shopping_list_export inbox items. Shows the list split
 * into Regulars / One-offs with checkboxes, then fires the export_selected
 * callback on the source node and polls until the result is ready.
 *
 * Provider-aware (v3 contract): for provider "walmart" unmapped rows are
 * disabled (with a "Find ID" picker) and the result carries a cart `url`;
 * for provider "notes" every row is exportable and the result carries a
 * plain-text list (`text`) with a copy-to-clipboard action.
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

type Nav = NativeStackNavigationProp<InboxStackParamList>;
type ExportRoute = RouteProp<InboxStackParamList, 'ExportShoppingList'>;

interface ShoppingListItem {
  key: string; // storage key — what the callback's selected entries reference
  item: string; // display name
  // null/empty = unmapped. Only matters for provider "walmart"; for
  // "notes" every row is exportable regardless.
  walmart_item_id: string | null;
  quantity?: number; // standing default from the list record (stepper seed)
}

const MAX_QUANTITY = 99;

/** Parse a stepper text value, clamped to 1-99; blank/garbage falls back to 1. */
const parseQuantity = (text: string | undefined): number => {
  const parsed = parseInt(text ?? '', 10);
  if (Number.isNaN(parsed)) return 1;
  return Math.max(1, Math.min(parsed, MAX_QUANTITY));
};

interface ExportMetadata {
  type?: string;
  provider?: 'walmart' | 'notes'; // what this screen renders for; absent = walmart
  sections?: {
    regulars?: ShoppingListItem[];
    one_offs?: ShoppingListItem[];
  };
  item_count?: number;
  node_id?: string; // auto-injected by CC — the node to send the callback to
}

/** context_data shape on a completed export_selected callback (v3).
 *  Exactly one of url (walmart) / text (notes) is set. */
interface ExportResult {
  url?: string; // walmart cart link
  text?: string; // notes: plain-text list, e.g. "Shopping list:\n- milk x2"
  exported?: string[]; // display names
  message?: string;
}

const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 30_000;

const hasWalmartId = (entry: ShoppingListItem): boolean => !!entry.walmart_item_id;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const ExportShoppingListScreen = () => {
  const route = useRoute<ExportRoute>();
  const navigation = useNavigation<Nav>();
  const theme = useTheme();
  const { state: authState } = useAuth();

  const [item, setItem] = useState<InboxItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Text state so mid-edit blanks don't fight the keyboard; parsed on use.
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [copied, setCopied] = useState(false);
  // key -> walmart_item_id picked via WalmartIdPicker this session. Takes
  // precedence over the metadata entry (the inbox metadata is a snapshot
  // and won't reflect mappings saved after it was created).
  const [idOverrides, setIdOverrides] = useState<Record<string, string>>({});

  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  const { itemId, pickedKey, pickedId } = route.params;

  // Roundtrip return from WalmartIdPicker: mark the row as mapped and
  // auto-select it so it's immediately exportable.
  useEffect(() => {
    if (!pickedKey || !pickedId) return;
    setIdOverrides((prev) =>
      prev[pickedKey] === pickedId ? prev : { ...prev, [pickedKey]: pickedId },
    );
    setSelected((prev) => {
      if (prev.has(pickedKey)) return prev;
      const next = new Set(prev);
      next.add(pickedKey);
      return next;
    });
  }, [pickedKey, pickedId]);

  const load = useCallback(async () => {
    if (!authState.accessToken) return;
    try {
      setError(null);
      setLoading(true);
      const data = await getInboxItem(itemId);
      if (!mountedRef.current) return;
      setItem(data);
      const meta = (data.metadata ?? {}) as ExportMetadata;
      const allEntries = [
        ...(meta.sections?.regulars ?? []),
        ...(meta.sections?.one_offs ?? []),
      ];
      // The metadata is a snapshot from export time. IDs saved since then
      // (the Find ID picker, the data browser, another phone) live in the
      // node's walmart_items map — fetch it so stored mappings always show.
      let liveIds: Record<string, string> = {};
      if (meta.node_id) {
        try {
          const live = await listRecords(meta.node_id, 'export_shopping_list');
          liveIds = Object.fromEntries(
            live.records
              .filter((r) => {
                const id = r.data?.walmart_item_id;
                return typeof id === 'string' && id.trim().length > 0;
              })
              .map((r) => [r.key, String(r.data.walmart_item_id)]),
          );
        } catch {
          // Node unreachable — fall back to the snapshot + session picks.
        }
      }
      if (!mountedRef.current) return;
      setIdOverrides((prev) => ({ ...liveIds, ...prev }));
      // Default selection: every exportable item starts checked. For
      // "notes" that's everything; for "walmart" all mapped items,
      // including ones mapped after this inbox item was created.
      const exportable =
        meta.provider === 'notes'
          ? allEntries
          : allEntries.filter((entry) => !!liveIds[entry.key] || hasWalmartId(entry));
      setSelected(new Set(exportable.map((entry) => entry.key)));
      // Seed steppers from each item's standing default quantity.
      setQuantities(
        Object.fromEntries(
          allEntries.map((entry) => [entry.key, String(entry.quantity ?? 1)]),
        ),
      );
    } catch {
      if (mountedRef.current) setError('Could not load item');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [authState.accessToken, itemId]);

  useEffect(() => {
    load();
  }, [load]);

  const meta = useMemo(
    () => ((item?.metadata ?? {}) as ExportMetadata),
    [item],
  );
  const provider: 'walmart' | 'notes' = meta.provider ?? 'walmart';
  const sourceNodeId = meta.node_id;
  const regulars = meta.sections?.regulars ?? [];
  const oneOffs = meta.sections?.one_offs ?? [];

  // "notes" ignores Walmart mappings entirely — every row is exportable.
  const isMapped = useCallback(
    (entry: ShoppingListItem): boolean =>
      provider === 'notes' || !!idOverrides[entry.key] || hasWalmartId(entry),
    [provider, idOverrides],
  );

  const mappedKeys = useMemo(
    () => [...regulars, ...oneOffs].filter(isMapped).map((entry) => entry.key),
    [regulars, oneOffs, isMapped],
  );

  const allSelected = mappedKeys.length > 0 && selected.size === mappedKeys.length;

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
      setSelected(new Set(mappedKeys));
    }
  }, [allSelected, mappedKeys]);

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

  const openCartUrl = useCallback((url: string) => {
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

  const onExport = useCallback(async () => {
    const nodeId = meta.node_id;
    if (!nodeId) {
      Alert.alert('Error', 'No node id on this item');
      return;
    }
    const selectedKeys = Array.from(selected);
    if (selectedKeys.length === 0) return;

    setExportError(null);
    setExporting(true);
    try {
      const response = await sendInteractiveCallback({
        command_name: 'export_shopping_list',
        callback_name: 'export_selected',
        data: {
          selected: selectedKeys.map((key) => ({
            key,
            quantity: parseQuantity(quantities[key]),
          })),
          // Echo the provider the screen rendered for, so the result
          // matches what the user saw. Node validates against known
          // providers and falls back to its configured one.
          provider,
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
            throw new Error('Timed out waiting for the export result.');
          }
          continue;
        }
        if (status.status !== 'completed') {
          throw new Error(
            status.status === 'expired'
              ? 'This request expired.'
              : status.error_message || 'Export failed.',
          );
        }
        const exportResult = (status.context_data ?? {}) as ExportResult;
        if (!mountedRef.current) return;
        setResult(exportResult);
        if (exportResult.url) openCartUrl(exportResult.url);
        return;
      }
    } catch (err: unknown) {
      if (mountedRef.current) {
        setExportError(err instanceof Error ? err.message : 'Export failed.');
      }
    } finally {
      if (mountedRef.current) setExporting(false);
    }
  }, [meta.node_id, provider, selected, quantities, openCartUrl]);

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

  if (error || !item) {
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
    const exportedNames = result.exported ?? [];
    return (
      <View style={styles.container}>
        {header}
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.successHeader}>
            <Icon source="check-circle" size={48} color={theme.colors.primary} />
            <Text variant="headlineSmall" style={styles.heading}>
              Exported
            </Text>
          </View>
          {result.message ? (
            <Text
              variant="bodyMedium"
              style={[styles.successMessage, { color: theme.colors.onSurfaceVariant }]}
            >
              {result.message}
            </Text>
          ) : null}
          {result.text ? (
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
          {exportedNames.length > 0 && (
            <>
              <Divider style={{ marginBottom: 8 }} />
              {exportedNames.map((name) => (
                <View key={name} style={styles.exportedRow}>
                  <Icon source="check" size={16} color={theme.colors.primary} />
                  <Text variant="bodyMedium" style={{ marginLeft: 8 }}>
                    {name}
                  </Text>
                </View>
              ))}
            </>
          )}
          <View style={styles.actions}>
            {result.url ? (
              <Button
                mode="contained"
                icon="open-in-new"
                onPress={() => openCartUrl(result.url!)}
              >
                Open Walmart cart
              </Button>
            ) : null}
            {result.text ? (
              <Button
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

  const renderSection = (title: string, entries: ShoppingListItem[]) => {
    if (entries.length === 0) return null;
    return (
      <List.Section>
        <List.Subheader>{title}</List.Subheader>
        {entries.map((entry) => {
          const mapped = isMapped(entry);
          const checked = mapped && selected.has(entry.key);
          return (
            <React.Fragment key={entry.key}>
              <TouchableOpacity
                style={styles.itemRow}
                onPress={() => toggleSelected(entry.key)}
                disabled={!mapped || exporting}
              >
                <Checkbox
                  status={checked ? 'checked' : 'unchecked'}
                  disabled={!mapped || exporting}
                  onPress={() => toggleSelected(entry.key)}
                />
                <View style={styles.itemInfo}>
                  <Text
                    variant="bodyLarge"
                    style={!mapped ? { color: theme.colors.onSurfaceVariant } : undefined}
                  >
                    {entry.item}
                  </Text>
                  {!mapped && (
                    <View style={styles.unmappedRow}>
                      <Text
                        variant="bodySmall"
                        style={{ color: theme.colors.onSurfaceVariant }}
                      >
                        No Walmart match
                      </Text>
                      {sourceNodeId ? (
                        <Button
                          compact
                          mode="text"
                          disabled={exporting}
                          onPress={() =>
                            navigation.navigate('WalmartIdPicker', {
                              searchQuery: entry.item,
                              recordKey: entry.key,
                              nodeId: sourceNodeId,
                              itemId,
                            })
                          }
                        >
                          Find ID
                        </Button>
                      ) : null}
                    </View>
                  )}
                  {mapped && provider === 'walmart' && sourceNodeId ? (
                    <View style={styles.unmappedRow}>
                      <Text
                        variant="bodySmall"
                        style={{ color: theme.colors.onSurfaceVariant }}
                      >
                        ID {idOverrides[entry.key] ?? entry.walmart_item_id}
                      </Text>
                      <Button
                        compact
                        mode="text"
                        disabled={exporting}
                        onPress={() =>
                          navigation.navigate('WalmartIdPicker', {
                            searchQuery: entry.item,
                            recordKey: entry.key,
                            nodeId: sourceNodeId,
                            itemId,
                            // Open straight on the stored product to confirm it
                            productId:
                              idOverrides[entry.key] ??
                              entry.walmart_item_id ??
                              undefined,
                          })
                        }
                      >
                        View
                      </Button>
                      <Button
                        compact
                        mode="text"
                        disabled={exporting}
                        onPress={() =>
                          navigation.navigate('WalmartIdPicker', {
                            searchQuery: entry.item,
                            recordKey: entry.key,
                            nodeId: sourceNodeId,
                            itemId,
                          })
                        }
                      >
                        Change ID
                      </Button>
                    </View>
                  ) : null}
                </View>
                {mapped && (
                  <View style={styles.stepper}>
                    <IconButton
                      icon="minus"
                      size={16}
                      disabled={exporting || parseQuantity(quantities[entry.key]) <= 1}
                      onPress={() => bumpQuantity(entry.key, -1)}
                    />
                    <TextInput
                      mode="outlined"
                      dense
                      value={quantities[entry.key] ?? '1'}
                      onChangeText={(text) => setQuantityText(entry.key, text)}
                      onBlur={() =>
                        setQuantityText(
                          entry.key,
                          String(parseQuantity(quantities[entry.key])),
                        )
                      }
                      keyboardType="number-pad"
                      disabled={exporting}
                      style={styles.quantityInput}
                      contentStyle={styles.quantityInputContent}
                    />
                    <IconButton
                      icon="plus"
                      size={16}
                      disabled={
                        exporting ||
                        parseQuantity(quantities[entry.key]) >= MAX_QUANTITY
                      }
                      onPress={() => bumpQuantity(entry.key, 1)}
                    />
                  </View>
                )}
              </TouchableOpacity>
              <Divider />
            </React.Fragment>
          );
        })}
      </List.Section>
    );
  };

  const hasItems = regulars.length > 0 || oneOffs.length > 0;

  return (
    <View style={styles.container}>
      {header}

      <View style={styles.titleBlock}>
        <Chip compact style={styles.chip} textStyle={styles.chipText}>
          shopping list
        </Chip>
        <Text variant="headlineSmall" style={styles.heading}>
          {item.title}
        </Text>
        <View style={styles.selectRow}>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            {selected.size} of {mappedKeys.length} selected
          </Text>
          <Button
            compact
            mode="text"
            onPress={toggleSelectAll}
            disabled={mappedKeys.length === 0 || exporting}
          >
            {allSelected ? 'Clear' : 'All'}
          </Button>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.listContent}>
        {hasItems ? (
          <>
            {renderSection('Regulars', regulars)}
            {renderSection('One-offs', oneOffs)}
          </>
        ) : (
          <View style={styles.center}>
            <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant }}>
              No items to export
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.bottomActions}>
        {exporting && (
          <View style={styles.progressRow}>
            <ActivityIndicator size="small" />
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.onSurfaceVariant, marginLeft: 8 }}
            >
              {provider === 'notes'
                ? 'Building your list…'
                : 'Building your Walmart cart…'}
            </Text>
          </View>
        )}
        {exportError && (
          <Text
            variant="bodySmall"
            style={[styles.errorText, { color: theme.colors.error }]}
          >
            {exportError}
          </Text>
        )}
        <Button
          mode="contained"
          onPress={onExport}
          loading={exporting}
          disabled={selected.size === 0 || exporting}
        >
          {exportError
            ? 'Retry'
            : `Export ${selected.size} item${selected.size === 1 ? '' : 's'}`}
        </Button>
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
  unmappedRow: { flexDirection: 'row', alignItems: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center' },
  quantityInput: { width: 52, height: 36, textAlign: 'center' },
  quantityInputContent: { textAlign: 'center', paddingHorizontal: 4 },
  bottomActions: { padding: 16, gap: 8 },
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
  exportedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  actions: { marginTop: 32, gap: 8 },
});

export default ExportShoppingListScreen;
