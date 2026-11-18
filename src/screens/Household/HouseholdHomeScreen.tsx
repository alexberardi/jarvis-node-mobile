import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Card, Divider, Icon, List, Menu, Text, useTheme } from 'react-native-paper';

import authApi from '../../api/authApi';
import { listNodes } from '../../api/nodeApi';
import { useAuth } from '../../auth/AuthContext';
import YouAvatar from '../../components/YouAvatar';
import type { HouseholdSection, NodesStackParamList, RootStackParamList } from '../../navigation/types';

type Nav = NativeStackNavigationProp<NodesStackParamList & RootStackParamList>;

interface Tile {
  key: string;
  icon: string;
  title: string;
  subtitle: string;
  onPress: () => void;
}

/** The Household tab: one home for everything that belongs to this household. */
const HouseholdHomeScreen = () => {
  const theme = useTheme();
  const navigation = useNavigation<Nav>();
  const { state, switchHousehold } = useAuth();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [nodes, setNodes] = useState<{ online: number; total: number } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const household = state.households.find((h) => h.id === state.activeHouseholdId);
  const householdId = household?.id;

  const load = useCallback(async () => {
    if (!householdId) return;
    const [members, nodeList] = await Promise.all([
      authApi
        .get<unknown[]>(`/households/${householdId}/members`, {
          headers: { Authorization: `Bearer ${state.accessToken}` },
        })
        .then((r) => r.data.length)
        .catch(() => null),
      listNodes(householdId).catch(() => null),
    ]);
    setMemberCount(members);
    setNodes(nodeList ? { online: nodeList.filter((n) => n.online).length, total: nodeList.length } : null);
  }, [householdId, state.accessToken]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const openSection = (section: HouseholdSection) => {
    if (household) {
      navigation.navigate('HouseholdEdit', { householdId: household.id, householdName: household.name, section });
    }
  };

  const tiles: Tile[] = [
    { key: 'jarvis', icon: 'robot-happy-outline', title: 'Jarvis', subtitle: 'Personality, capabilities', onPress: () => openSection('jarvis') },
    {
      key: 'nodes',
      icon: 'access-point',
      title: 'Nodes',
      subtitle: nodes ? (nodes.total ? `${nodes.online} of ${nodes.total} online` : 'None yet') : 'Speakers and computers',
      onPress: () => navigation.navigate('NodeList'),
    },
    { key: 'knowledge', icon: 'book-open-variant', title: 'Knowledge', subtitle: 'Memories', onPress: () => openSection('knowledge') },
    { key: 'members', icon: 'account-group-outline', title: 'Members', subtitle: memberCount != null ? `${memberCount} in this home` : 'Roles and invites', onPress: () => openSection('members') },
  ];

  const homeRows: { key: string; title: string; description: string; icon: string; onPress: () => void }[] = [
    { key: 'home', title: 'Name, location & time zone', description: household?.name ?? '', icon: 'home-edit-outline', onPress: () => openSection('home') },
    { key: 'presence', title: 'Presence', description: 'Home/away, on this phone', icon: 'map-marker-radius-outline', onPress: () => openSection('presence') },
    { key: 'smart-home', title: 'Smart home', description: 'Primary node, Home Assistant', icon: 'home-automation', onPress: () => navigation.navigate('Settings', { view: 'smart_home' }) },
    { key: 'calls', title: 'Phone calls', description: 'Twilio, phonebook', icon: 'phone-outline', onPress: () => openSection('calls') },
    {
      key: 'automations',
      title: 'Automations',
      description: 'What Jarvis does when something happens',
      icon: 'flash-outline',
      onPress: () => householdId && navigation.navigate('SignalAutomations', { householdId }),
    },
  ];

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <Menu
          visible={switcherOpen}
          onDismiss={() => setSwitcherOpen(false)}
          anchor={
            <TouchableOpacity
              onPress={() => setSwitcherOpen(true)}
              style={styles.switcher}
              testID="household-switcher"
              accessibilityRole="button"
              accessibilityLabel="Switch household"
            >
              <Text variant="headlineMedium" style={styles.title} numberOfLines={1}>
                {household?.name ?? 'Household'}
              </Text>
              <Icon source="chevron-down" size={24} />
            </TouchableOpacity>
          }
        >
          {state.households.map((h) => (
            <Menu.Item
              key={h.id}
              testID={`household-switch-${h.id}`}
              leadingIcon={h.id === state.activeHouseholdId ? 'check' : 'home-outline'}
              title={h.name}
              onPress={() => {
                setSwitcherOpen(false);
                if (h.id !== state.activeHouseholdId) switchHousehold(h.id);
              }}
            />
          ))}
          <Divider />
          <Menu.Item
            testID="household-join-create"
            leadingIcon="plus"
            title="Join or create a household"
            onPress={() => {
              setSwitcherOpen(false);
              navigation.navigate('Settings', { view: 'households' });
            }}
          />
        </Menu>
        <YouAvatar testID="household-you-button" />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {!household ? (
          <Card style={styles.card}>
            <Card.Content>
              <Text variant="bodyMedium">You are not in a household yet.</Text>
              <List.Item
                title="Join or create a household"
                left={(props) => <List.Icon {...props} icon="plus" />}
                onPress={() => navigation.navigate('Settings', { view: 'households' })}
              />
            </Card.Content>
          </Card>
        ) : (
          <>
            <View style={styles.tiles}>
              {tiles.map((t) => (
                <Card key={t.key} style={styles.tile} onPress={t.onPress} testID={`household-tile-${t.key}`}>
                  <Card.Content style={{ gap: 6 }}>
                    <Icon source={t.icon} size={26} color={theme.colors.primary} />
                    <Text variant="titleMedium">{t.title}</Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      {t.subtitle}
                    </Text>
                  </Card.Content>
                </Card>
              ))}
            </View>

            <Text variant="labelLarge" style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>
              This home
            </Text>
            <Card style={styles.card}>
              {homeRows.map((r, i) => (
                <React.Fragment key={r.key}>
                  {i > 0 && <Divider />}
                  <List.Item
                    testID={`household-home-row-${r.key}`}
                    title={r.title}
                    description={r.description}
                    left={(props) => <List.Icon {...props} icon={r.icon} />}
                    right={(props) => <List.Icon {...props} icon="chevron-right" />}
                    onPress={r.onPress}
                  />
                </React.Fragment>
              ))}
            </Card>
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 8,
  },
  switcher: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, gap: 4 },
  title: { fontWeight: 'bold', flexShrink: 1 },
  content: { padding: 16, paddingBottom: 32 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { flexBasis: '47%', flexGrow: 1 },
  label: { marginTop: 24, marginBottom: 8, marginLeft: 4 },
  card: { marginBottom: 12 },
});

export default HouseholdHomeScreen;
