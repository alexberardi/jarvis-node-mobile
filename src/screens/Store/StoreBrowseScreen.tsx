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
  Searchbar,
  Text,
  useTheme,
} from 'react-native-paper';

import { browsePackages, getCategories } from '../../api/pantryApi';
import type { PackageCategory, PackageSummary } from '../../types/Package';
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

const StoreBrowseScreen = () => {
  const navigation = useNavigation<Nav>();
  const theme = useTheme();

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
        setError('Could not load packages');
      } finally {
        setLoading(false);
      }
    },
    [query, selectedCategory, sort],
  );

  const loadCategories = useCallback(async () => {
    try {
      const cats = await getCategories();
      setCategories(cats);
    } catch {
      // Non-critical
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadCategories();
    }, [loadCategories]),
  );

  // Reload when search/filter/sort changes
  useEffect(() => {
    loadPackages(1);
  }, [loadPackages]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadPackages(1), loadCategories()]);
    setRefreshing(false);
  }, [loadPackages, loadCategories]);

  const onEndReached = useCallback(() => {
    if (loading || packages.length >= total) return;
    loadPackages(page + 1, true);
  }, [loading, packages.length, total, page, loadPackages]);

  const renderItem = ({ item }: { item: PackageSummary }) => (
    <Card
      style={styles.card}
      onPress={() => navigation.navigate('StoreDetail', { commandName: item.command_name })}
    >
      <Card.Content>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text variant="titleMedium" numberOfLines={1}>
              {item.display_name || item.command_name}
            </Text>
            {item.author && (
              <Text
                variant="labelSmall"
                style={{ color: theme.colors.onSurfaceVariant }}
              >
                by {item.author}
              </Text>
            )}
          </View>
          <View style={styles.badges}>
            {item.verified && (
              <Icon source="check-decagram" size={18} color={theme.colors.primary} />
            )}
            {item.danger_rating >= 4 && (
              <Chip
                compact
                textStyle={{ fontSize: 10, color: '#fff' }}
                style={{ backgroundColor: DANGER_COLORS[item.danger_rating] }}
              >
                Risk {item.danger_rating}
              </Chip>
            )}
            {item.package_type === 'bundle' && (
              <Chip
                compact
                textStyle={{ fontSize: 10 }}
                style={{ backgroundColor: theme.colors.secondaryContainer }}
              >
                Bundle
              </Chip>
            )}
          </View>
        </View>
        <Text
          variant="bodySmall"
          style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}
          numberOfLines={2}
        >
          {item.description}
        </Text>
        <View style={styles.cardFooter}>
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
            v{item.latest_version}
          </Text>
          <View style={styles.installs}>
            <Icon source="download" size={14} color={theme.colors.onSurfaceVariant} />
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {item.install_count}
            </Text>
          </View>
        </View>
      </Card.Content>
    </Card>
  );

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
        <Text
          variant="headlineMedium"
          style={[styles.title, { color: theme.colors.onBackground }]}
        >
          Pantry
        </Text>
      </View>

      <Searchbar
        placeholder="Search packages..."
        value={query}
        onChangeText={setQuery}
        style={styles.searchbar}
      />

      {categories.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryRow}
          contentContainerStyle={styles.chipRowContent}
        >
          <Chip
            selected={!selectedCategory}
            onPress={() => setSelectedCategory(null)}
            compact
          >
            All
          </Chip>
          {categories.map((cat) => (
            <Chip
              key={cat.name}
              selected={selectedCategory === cat.name}
              onPress={() =>
                setSelectedCategory(selectedCategory === cat.name ? null : cat.name)
              }
              compact
            >
              {cat.name} ({cat.count})
            </Chip>
          ))}
        </ScrollView>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.sortRow}
        contentContainerStyle={styles.chipRowContent}
      >
        {SORT_OPTIONS.map((opt) => (
          <Chip
            key={opt.value}
            selected={sort === opt.value}
            onPress={() => setSort(opt.value)}
            compact
          >
            {opt.label}
          </Chip>
        ))}
      </ScrollView>

      {/* Package list */}
      <FlatList
        data={packages}
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
  searchbar: { marginHorizontal: 16, marginBottom: 8 },
  categoryRow: { marginBottom: 8, flexGrow: 0 },
  sortRow: { marginBottom: 4, flexGrow: 0 },
  chipRowContent: { gap: 8, paddingHorizontal: 16 },
  list: { padding: 16, gap: 12, paddingBottom: 32 },
  emptyList: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContent: { alignItems: 'center', paddingTop: 48 },
  card: {},
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  badges: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  installs: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});

export default StoreBrowseScreen;
