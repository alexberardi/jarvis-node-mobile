import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {
  Button,
  Card,
  Chip,
  Icon,
  IconButton,
  Menu,
  Searchbar,
  Text,
  TouchableRipple,
  useTheme,
} from 'react-native-paper';

import apiClient from '../../api/apiClient';
import { fetchNodeTools } from '../../api/chatApi';
import { browsePackages, getCategories } from '../../api/pantryApi';
import { useAuth } from '../../auth/AuthContext';
import { FirstRunCard } from '../../components/FirstRunCard';
import PantryStorePicker from '../../components/PantryStorePicker';
import { getServiceConfig } from '../../config/serviceConfig';
import { helpCopy } from '../../copy/help';
import { useFirstRun } from '../../hooks/useFirstRun';
import { usePantryStores } from '../../services/pantryStores';
import type { PackageCategory, PackageSummary } from '../../types/Package';
import StatusTag from '../../components/StatusTag';
import { categoryIcon, categoryLabel } from '../../utils/labels';
import { anyUpdate } from '../../utils/packageNodes';
import { StoreStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<StoreStackParamList>;

type SortOption = 'popular' | 'newest' | 'name';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'popular', label: 'Popular' },
  { value: 'newest', label: 'Newest' },
  { value: 'name', label: 'A-Z' },
];

const DANGER_COLORS: Record<number, string> = {
  1: '#22c55e',
  2: '#84cc16',
  3: '#f59e0b',
  4: '#f97316',
  5: '#ef4444',
};

interface NodeToolInfo {
  node_id: string;
  toolNames: string[];
  /** Installed package versions on the node, by package name. */
  versions: Record<string, string>;
}

const StoreBrowseScreen = () => {
  const navigation = useNavigation<Nav>();
  const theme = useTheme();
  const { state: authState } = useAuth();

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortOption>('popular');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categories, setCategories] = useState<PackageCategory[]>([]);
  const [packages, setPackages] = useState<PackageSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nodeTools, setNodeTools] = useState<NodeToolInfo[]>([]);
  const [nodeCount, setNodeCount] = useState(0);
  const [updatesOnly, setUpdatesOnly] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  const firstRun = useFirstRun('pantry');
  // The store picked: browsing talks to it directly, so a new pick reloads the list.
  const { store } = usePantryStores();
  const storeId = store?.id;
  const storeName = store?.name;

  const loadPackages = useCallback(
    async (pageNum: number = 1, append: boolean = false) => {
      try {
        setError(null);
        if (!append) setLoading(true);
        const res = await browsePackages({
          q: query || undefined,
          category: selectedCategory || undefined,
          sort,
          page: pageNum,
          per_page: 20,
        });
        setPackages((prev) => (append ? [...prev, ...res.commands] : res.commands));
        setTotal(res.total);
        setPage(pageNum);
      } catch {
        // One unreachable store fails alone: say which, and the picker still offers the others.
        setError(storeName ? `Could not reach ${storeName}` : 'Could not load packages');
      } finally {
        setLoading(false);
      }
    },
    // storeId: browsePackages reads the picked store's URL, so a new pick reloads.
    [query, selectedCategory, sort, storeId, storeName],
  );

  const loadCategories = useCallback(async () => {
    try {
      const cats = await getCategories();
      setCategories(cats);
    } catch (err) {
      setCategories([]);
      console.error('[StoreBrowseScreen] Failed to load categories', err);
    }
  }, [storeId]);

  const loadNodeTools = useCallback(async () => {
    const householdId = authState.activeHouseholdId;
    if (!householdId) return;
    try {
      const { commandCenterUrl } = getServiceConfig();
      const res = await apiClient.get<{ node_id: string; room: string | null }[]>(
        `${commandCenterUrl}/api/v0/admin/nodes?household_id=${householdId}`,
      );
      const nodes = res.data || [];
      setNodeCount(nodes.length);

      const toolResults = await Promise.all(
        nodes.map(async (node) => {
          try {
            const tools = await fetchNodeTools(node.node_id);
            const names = tools.client_tools
              .map((t: Record<string, unknown>) => (t.function as Record<string, unknown>)?.name as string)
              .filter(Boolean);
            const versions = Object.fromEntries((tools.installed_packages ?? []).map((p) => [p.name, p.version]));
            return { node_id: node.node_id, toolNames: names as string[], versions };
          } catch {
            return { node_id: node.node_id, toolNames: [] as string[], versions: {} };
          }
        }),
      );
      setNodeTools(toolResults);
    } catch (err) {
      console.error('[StoreBrowseScreen] Failed to load node tools', err);
    }
  }, [authState.activeHouseholdId]);

  /** Where a package stands in this home: on how many nodes, and whether any is behind. */
  const standing = useCallback(
    (item: PackageSummary) => {
      const on = nodeTools.filter((n) => item.command_name in n.versions || n.toolNames.includes(item.command_name));
      return {
        installed: on.length,
        update: anyUpdate(on.map((n) => n.versions[item.command_name]), item.latest_version),
      };
    },
    [nodeTools],
  );

  useFocusEffect(
    useCallback(() => {
      loadCategories();
      loadNodeTools();
    }, [loadCategories, loadNodeTools]),
  );

  // Reload when search/filter/sort changes
  useEffect(() => {
    loadPackages(1);
  }, [loadPackages]);

  // shortcut: counts updates among the packages loaded so far (first page), not the whole store;
  // upgrade with a server call for installed-package updates if a home has many packages.
  const updateCount = packages.filter((p) => standing(p).update).length;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadPackages(1), loadCategories()]);
    setRefreshing(false);
  }, [loadPackages, loadCategories]);

  const onEndReached = useCallback(() => {
    if (loading || packages.length >= total) return;
    loadPackages(page + 1, true);
  }, [loading, packages.length, total, page, loadPackages]);

  const renderItem = ({ item }: { item: PackageSummary }) => {
    const { installed, update } = standing(item);
    const category = item.categories[0];
    return (
      <Card
        style={styles.card}
        mode="outlined"
        onPress={() => navigation.navigate('StoreDetail', { commandName: item.command_name })}
        testID={`package-card-${item.command_name}`}
      >
        <View style={styles.row}>
          <View style={[styles.icon, { backgroundColor: theme.colors.secondaryContainer }]}>
            <Icon source={categoryIcon(category)} size={22} color={theme.colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.nameLine}>
              <Text variant="titleMedium" numberOfLines={1} style={{ flexShrink: 1 }}>
                {item.display_name || item.command_name}
              </Text>
              {item.verified && <Icon source="check-decagram" size={16} color={theme.colors.primary} />}
            </View>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={2}>
              {item.description}
            </Text>
            <Text variant="labelSmall" style={[styles.meta, { color: theme.colors.onSurfaceVariant }]}>
              {[category ? categoryLabel(category) : null, `${item.install_count} installs`].filter(Boolean).join(' \u00b7 ')}
            </Text>
          </View>
          <View style={styles.status}>
            {update ? (
              <StatusTag label="Update" tone="need" />
            ) : installed > 0 ? (
              <StatusTag label={nodeCount > 1 ? `On ${installed} of ${nodeCount}` : 'Installed'} tone="ok" />
            ) : (
              <StatusTag label="Get" tone="off" />
            )}
            {item.danger_rating >= 4 && (
              <Text style={[styles.risk, { color: DANGER_COLORS[item.danger_rating] }]}>Risk {item.danger_rating}</Text>
            )}
          </View>
        </View>
      </Card>
    );
  };

  const emptyComponent = (
    <View style={styles.emptyContent}>
      <Text
        variant="bodyLarge"
        style={{ color: error ? theme.colors.error : theme.colors.onSurfaceVariant }}
      >
        {error || (loading ? 'Loading...' : 'No packages found')}
      </Text>
      {error && (
        <Button mode="text" onPress={() => loadPackages(1)} style={{ marginTop: 8 }}>
          Retry
        </Button>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Fixed header — stays outside FlatList so empty-state styles don't stretch it */}
      <View style={styles.header}>
        <Text variant="headlineMedium" style={[styles.title, { color: theme.colors.onBackground }]}>
          Pantry
        </Text>
        <Menu
          visible={menuOpen}
          onDismiss={() => setMenuOpen(false)}
          anchor={<IconButton icon="dots-vertical" testID="pantry-menu" accessibilityLabel="More" onPress={() => setMenuOpen(true)} />}
        >
          <Menu.Item
            leadingIcon="flask-outline"
            title="Test a share code"
            testID="pantry-test"
            onPress={() => {
              setMenuOpen(false);
              navigation.navigate('TestInstall');
            }}
          />
          <Menu.Item
            leadingIcon="help-circle-outline"
            title="What is the Pantry?"
            onPress={() => {
              setMenuOpen(false);
              firstRun.showAgain();
            }}
          />
        </Menu>
      </View>

      <FirstRunCard
        visible={firstRun.visible}
        onDismiss={firstRun.dismiss}
        title={helpCopy.pantry.firstRunTitle}
        body={helpCopy.pantry.firstRun}
      />

      {/* The store scopes the search, so it comes first (only shown with several stores). */}
      <PantryStorePicker style={styles.storePicker} />

      <Searchbar
        placeholder="Search packages"
        value={query}
        onChangeText={setQuery}
        style={styles.searchbar}
        testID="searchbar-input"
      />

      {updateCount > 0 && (
        <TouchableRipple
          testID="pantry-updates"
          onPress={() => setUpdatesOnly((u) => !u)}
          style={[styles.banner, { backgroundColor: theme.dark ? '#7c2d12' : '#ffedd5' }]}
        >
          <View style={styles.bannerRow}>
            <Icon source="arrow-up-circle-outline" size={20} color={theme.dark ? '#fed7aa' : '#9a3412'} />
            <Text style={[styles.bannerText, { color: theme.dark ? '#fed7aa' : '#9a3412' }]}>
              {updateCount} update{updateCount === 1 ? '' : 's'} ready
            </Text>
            <Text style={[styles.bannerText, { color: theme.dark ? '#fed7aa' : '#9a3412' }]}>{updatesOnly ? 'Show all' : 'Review'}</Text>
          </View>
        </TouchableRipple>
      )}

      <View style={styles.chipBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRowContent} style={{ flex: 1 }}>
          <Chip
            selected={!selectedCategory}
            showSelectedCheck={false}
            onPress={() => setSelectedCategory(null)}
            compact
            testID="category-chip-All"
          >
            All
          </Chip>
          {categories.map((cat) => (
            <Chip
              key={cat.name}
              selected={selectedCategory === cat.name}
              showSelectedCheck={false}
              onPress={() => setSelectedCategory(selectedCategory === cat.name ? null : cat.name)}
              compact
              testID={`category-chip-${cat.name}`}
            >
              {categoryLabel(cat.name)}
            </Chip>
          ))}
        </ScrollView>
        <Menu
          visible={sortOpen}
          onDismiss={() => setSortOpen(false)}
          anchor={
            <Chip mode="outlined" compact icon="sort" onPress={() => setSortOpen(true)} testID="sort-chip" style={{ marginRight: 16 }}>
              {SORT_OPTIONS.find((o) => o.value === sort)?.label}
            </Chip>
          }
        >
          {SORT_OPTIONS.map((opt) => (
            <Menu.Item
              key={opt.value}
              testID={`sort-chip-${opt.value}`}
              title={opt.label}
              leadingIcon={sort === opt.value ? 'check' : undefined}
              onPress={() => {
                setSortOpen(false);
                setSort(opt.value);
              }}
            />
          ))}
        </Menu>
      </View>

      {/* Package list */}
      <FlatList
        data={updatesOnly ? packages.filter((p) => standing(p).update) : packages}
        keyExtractor={(item) => item.command_name}
        renderItem={renderItem}
        ListEmptyComponent={emptyComponent}
        contentContainerStyle={packages.length === 0 ? styles.emptyList : styles.list}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 48 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    paddingHorizontal: 16,
  },
  title: { fontWeight: 'bold', flex: 1 },
  storePicker: { marginHorizontal: 16, marginBottom: 8, alignSelf: 'flex-start' },
  searchbar: { marginHorizontal: 16, marginBottom: 8 },
  banner: { marginHorizontal: 16, marginBottom: 8, borderRadius: 12 },
  bannerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  bannerText: { fontWeight: '600', fontSize: 13 },
  chipBar: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  chipRowContent: { gap: 6, paddingHorizontal: 16, paddingVertical: 4 },
  list: { padding: 16, paddingTop: 4, gap: 10, paddingBottom: 32 },
  emptyList: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContent: { alignItems: 'center', paddingTop: 48 },
  card: {},
  row: { flexDirection: 'row', gap: 12, alignItems: 'center', padding: 12 },
  icon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { marginTop: 3, opacity: 0.8 },
  status: { alignItems: 'flex-end', gap: 4 },
  risk: { fontSize: 11, fontWeight: '600' },
});

export default StoreBrowseScreen;
