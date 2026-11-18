import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Appbar, Card, Divider, Icon, List, Text, useTheme } from 'react-native-paper';

import type { NodesStackParamList } from '../../navigation/types';
import { isPersonal, needsSetup, type Credential } from '../../utils/credentials';
import { joinNames, useCredentials } from './useCredentials';

type Nav = NativeStackNavigationProp<NodesStackParamList>;

/** A small status pill: green set, amber needs you, blue personal, grey can't check. */
export const StatusTag = ({ label, tone }: { label: string; tone: 'ok' | 'need' | 'me' | 'off' }) => {
  const theme = useTheme();
  const colors = {
    ok: { bg: theme.dark ? '#14532d' : '#dcfce7', fg: theme.dark ? '#bbf7d0' : '#166534' },
    need: { bg: theme.dark ? '#7c2d12' : '#ffedd5', fg: theme.dark ? '#fed7aa' : '#9a3412' },
    me: { bg: theme.dark ? '#0c4a6e' : '#e0f2fe', fg: theme.dark ? '#bae6fd' : '#075985' },
    off: { bg: theme.colors.surfaceVariant, fg: theme.colors.onSurfaceVariant },
  }[tone];
  return (
    <View style={[styles.tag, { backgroundColor: colors.bg }]}>
      <Text style={[styles.tagText, { color: colors.fg }]}>{label}</Text>
    </View>
  );
};

/** Every API key and sign-in across the household's nodes (or one node's). */
const CredentialsScreen = () => {
  const navigation = useNavigation<Nav>();
  const theme = useTheme();
  const onlyNodeId = useRoute<RouteProp<NodesStackParamList, 'Credentials'>>().params?.nodeId;
  const { reads, credentials, nameOf, nodesLoading, refreshing, refetchAll } = useCredentials(onlyNodeId);

  const needs = credentials.filter(needsSetup);
  const fine = credentials.filter((c) => !needsSetup(c));
  const unreadable = reads.filter((r) => r.state !== 'loaded');

  const row = (c: Credential) => {
    const nodes = joinNames(c.nodes.map((n) => nameOf(n.nodeId)));
    const need = needsSetup(c);
    const personal = isPersonal(c);
    return (
      <List.Item
        key={c.id}
        testID={`credential-${c.id}`}
        title={c.name}
        description={`${c.kind === 'device' ? 'Device protocol' : personal ? 'Personal' : 'Shared'} · ${nodes}`}
        descriptionNumberOfLines={2}
        onPress={() => navigation.navigate('CredentialDetail', { id: c.id, nodeId: onlyNodeId })}
        left={() => (
          <View style={[styles.icon, { backgroundColor: need ? (theme.dark ? '#7c2d12' : '#ffedd5') : theme.colors.secondaryContainer }]}>
            <Icon source={c.kind === 'device' ? 'home-automation' : c.auth ? 'account-key-outline' : 'key-outline'} size={20} color={need ? '#c2410c' : theme.colors.primary} />
          </View>
        )}
        right={() => (
          <View style={styles.right}>
            <StatusTag
              label={need ? (c.auth ? 'Sign in' : 'Needs setup') : personal ? 'Personal' : 'Set'}
              tone={need ? 'need' : personal ? 'me' : 'ok'}
            />
            <Icon source="chevron-right" size={20} color={theme.colors.onSurfaceVariant} />
          </View>
        )}
      />
    );
  };

  const group = (label: string, items: React.ReactNode[], testID: string) =>
    items.length > 0 && (
      <View testID={testID}>
        <Text variant="labelLarge" style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>{label}</Text>
        <Card mode="outlined" style={styles.card}>
          <View>
          {items.map((it, i) => (
            <React.Fragment key={i}>
              {i > 0 && <Divider />}
              {it}
            </React.Fragment>
          ))}
          </View>
        </Card>
      </View>
    );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title={onlyNodeId ? `Credentials · ${nameOf(onlyNodeId)}` : 'Credentials'} />
      </Appbar.Header>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetchAll} />}
      >
        {nodesLoading && <ActivityIndicator style={{ marginTop: 32 }} />}
        {group('Needs you', needs.map(row), 'credentials-needs')}
        {group('Set up', fine.map(row), 'credentials-set')}
        {group(
          reads.some((r) => r.state === 'checking') ? 'Checking' : 'Can’t check',
          unreadable.map((r) => (
            <List.Item
              key={r.node.node_id}
              testID={`credentials-node-${r.node.node_id}`}
              title={r.name}
              description={
                r.state === 'checking'
                  ? 'Asking the node…'
                  : r.state === 'no_key'
                    ? 'This phone has no key for it'
                    : r.error
              }
              onPress={r.state === 'no_key' ? () => navigation.navigate('ImportKey') : undefined}
              left={() => (
                <View style={[styles.icon, { backgroundColor: theme.colors.surfaceVariant }]}>
                  {r.state === 'checking' ? <ActivityIndicator size={16} /> : <Icon source="key-remove" size={20} color={theme.colors.onSurfaceVariant} />}
                </View>
              )}
              right={() =>
                r.state === 'no_key' ? (
                  <View style={styles.right}><StatusTag label="Import key" tone="off" /></View>
                ) : null
              }
            />
          )),
          'credentials-unreadable',
        )}
        {!nodesLoading && reads.length > 0 && credentials.length === 0 && unreadable.length === 0 && (
          <Text variant="bodyMedium" style={[styles.empty, { color: theme.colors.onSurfaceVariant }]}>
            No installed package needs a key or a sign-in.
          </Text>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  label: { marginTop: 8, marginBottom: 6, marginLeft: 4 },
  card: { marginBottom: 12, overflow: 'hidden' },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginLeft: 12 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  tagText: { fontSize: 11, fontWeight: '600' },
  empty: { textAlign: 'center', marginTop: 32 },
});

export default CredentialsScreen;
