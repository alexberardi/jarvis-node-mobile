import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import {
  ActivityIndicator,
  Appbar,
  Button,
  Card,
  Checkbox,
  Divider,
  List,
  Menu,
  Modal,
  Portal,
  Snackbar,
  Text,
  useTheme,
} from 'react-native-paper';

import { listHouseholdMembers } from '../../api/householdApi';
import { useAuth } from '../../auth/AuthContext';
import SecretEditDialog from '../../components/SecretEditDialog';
import type { NodesStackParamList } from '../../navigation/types';
import { encryptAndPushConfig } from '../../services/configPushService';
import { buildSyncPushes } from '../../services/syncPushes';
import { fieldStatus, missingOn, type CredentialField } from '../../utils/credentials';
import { StatusTag } from './CredentialsScreen';
import { joinNames, snapshotQueryKey, useCredentials } from './useCredentials';

type Nav = NativeStackNavigationProp<NodesStackParamList>;

/** One credential across nodes: sign in, set its fields, and choose which nodes a change goes to. */
const CredentialDetailScreen = () => {
  const navigation = useNavigation<Nav>();
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { state: authState } = useAuth();
  const { id, nodeId: onlyNodeId } = useRoute<RouteProp<NodesStackParamList, 'CredentialDetail'>>().params;
  const { householdId, credentials, nameOf, refreshing } = useCredentials(onlyNodeId);
  const credential = credentials.find((c) => c.id === id);
  const nodeIds = credential?.nodes.map((n) => n.nodeId) ?? [];

  // Ticked nodes: every node with this credential, until the user unticks one.
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const ticked = nodeIds.filter((n) => !unticked.has(n));
  const [editing, setEditing] = useState<CredentialField | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [signInMenu, setSignInMenu] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [toast, setToast] = useState('');

  const members = useQuery({
    queryKey: ['householdMembers', householdId],
    queryFn: () => listHouseholdMembers(householdId!, authState.accessToken ?? ''),
    enabled: !!householdId && !!credential?.fields.some((f) => f.value_type === 'user'),
  });

  useEffect(() => {
    if (credential) navigation.setOptions?.({ title: credential.name });
  }, [credential, navigation]);

  const refreshNodes = (ids: string[]) =>
    ids.forEach((n) => queryClient.invalidateQueries({ queryKey: snapshotQueryKey(n) }));

  if (!credential) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Appbar.Header>
          <Appbar.BackAction onPress={() => navigation.goBack()} />
          <Appbar.Content title="Credential" />
        </Appbar.Header>
        <View style={styles.center}>
          <ActivityIndicator />
          <Text variant="bodyMedium" style={{ marginTop: 12, color: theme.colors.onSurfaceVariant }}>
            Asking the nodes{'…'}
          </Text>
        </View>
      </View>
    );
  }

  const valueOf = (key: string) => {
    for (const n of credential.nodes) if (ticked.includes(n.nodeId) && n.values[key] != null) return n.values[key];
    return undefined;
  };
  const fieldNodes = (f: CredentialField) =>
    credential.nodes.filter((n) => ticked.includes(n.nodeId) && f.key in n.set).map((n) => n.nodeId);

  const signIn = (nodeId: string) => {
    if (!credential.auth || !authState.accessToken) return;
    const values = credential.nodes.find((n) => n.nodeId === nodeId)?.values ?? {};
    const authConfig = { ...credential.auth };
    // Device protocols put secret values into the authorize URL ({project_id}), as the node
    // settings screen does.
    if (authConfig.authorize_url) {
      for (const [key, value] of Object.entries(values)) {
        if (!value) continue;
        const shortKey = key.replace(/^[A-Z]+_/, '').toLowerCase();
        authConfig.authorize_url = authConfig.authorize_url
          .replace(`{${key.toLowerCase()}}`, value)
          .replace(`{${shortKey}}`, value);
      }
    }
    const urlKey = Object.keys(values).find((k) => (k.endsWith('_REST_URL') || k.endsWith('_URL')) && values[k]);
    navigation.navigate('IntegrationAuth', {
      authConfig: JSON.stringify(authConfig),
      nodeId,
      accessToken: authState.accessToken,
      providerBaseUrl: urlKey ? values[urlKey] : undefined,
    });
  };

  const applyPresets = (presetValues: Record<string, string>) => {
    const targets = ticked;
    const lines = Object.entries(presetValues).map(([k, v]) => {
      const f = credential.fields.find((x) => x.key === k);
      return `${f?.friendly_name ?? k}: ${v}`;
    });
    Alert.alert('Apply Defaults?', `This will set:\n\n${lines.join('\n')}\n\nYou can override individual values afterward.`, [
      { text: 'Skip', style: 'cancel' },
      {
        text: 'Apply',
        onPress: async () => {
          const pushes = buildSyncPushes(
            Object.keys(presetValues).map((key) => ({ key, scope: credential.fields.find((f) => f.key === key)?.scope })),
            presetValues,
            authState.user?.id,
          );
          try {
            for (const nodeId of targets) for (const push of pushes) await encryptAndPushConfig(nodeId, 'settings:secrets', push);
            refreshNodes(targets);
          } catch {
            Alert.alert('Error', 'Failed to apply defaults');
          }
        },
      },
    ]);
  };

  const statusTag = (f: CredentialField) => {
    const st = fieldStatus(credential, f, ticked);
    return st === 'set' ? (
      <StatusTag label="Set" tone="ok" />
    ) : st === 'partly' ? (
      <StatusTag label="Set on some" tone="need" />
    ) : st === 'required' ? (
      <StatusTag label="Required" tone="need" />
    ) : (
      <StatusTag label="Optional" tone="off" />
    );
  };

  const signInNodes = ticked;
  const isSet = (f: CredentialField) => ['set', 'partly'].includes(fieldStatus(credential, f, ticked));
  return (
    // Local Portal.Host: the edit sheet reads auth, and the app-level portal sits outside it.
    <Portal.Host>
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title={credential.name} />
        {credential.setupGuide && (
          <Appbar.Action icon="help-circle-outline" accessibilityLabel="Setup help" testID="credential-help" onPress={() => setHelpOpen(true)} />
        )}
        <Menu
          visible={menuOpen}
          onDismiss={() => setMenuOpen(false)}
          anchor={<Appbar.Action icon="dots-vertical" testID="credential-menu" accessibilityLabel="More" onPress={() => setMenuOpen(true)} />}
        >
          {credential.nodes.map((n) => (
            <Menu.Item
              key={n.nodeId}
              leadingIcon="tune-variant"
              title={`On ${nameOf(n.nodeId)}: switches, uninstall`}
              onPress={() => {
                setMenuOpen(false);
                navigation.navigate('NodeSettings', { nodeId: n.nodeId, room: nameOf(n.nodeId), tab: 'integrations' });
              }}
            />
          ))}
        </Menu>
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.content}>
        {refreshing && (
          <View style={[styles.updating, { backgroundColor: theme.colors.secondaryContainer }]} testID="credential-updating">
            <ActivityIndicator size={14} />
            <Text variant="bodySmall" style={{ color: theme.colors.onSecondaryContainer }}>Updating from the nodes{'…'}</Text>
          </View>
        )}

        {credential.auth && (
          <Menu
            visible={signInMenu}
            onDismiss={() => setSignInMenu(false)}
            anchor={
              <Button
                mode="contained"
                icon="login"
                testID="credential-sign-in"
                disabled={signInNodes.length === 0}
                onPress={() => (signInNodes.length === 1 ? signIn(signInNodes[0]) : setSignInMenu(true))}
                style={styles.signIn}
              >
                Sign in{credential.auth.provider ? ` with ${credential.auth.provider}` : ''}
              </Button>
            }
          >
            {signInNodes.map((n) => (
              <Menu.Item key={n} title={`On ${nameOf(n)}`} onPress={() => { setSignInMenu(false); signIn(n); }} />
            ))}
          </Menu>
        )}

        {credential.fields.length > 0 && (
          <>
            <Text variant="labelLarge" style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>Settings</Text>
            <Card mode="outlined" style={styles.card}>
              <View>
              {credential.fields.map((f, i) => {
                const preview = valueOf(f.key);
                return (
                  <React.Fragment key={f.key}>
                    {i > 0 && <Divider />}
                    <List.Item
                      testID={`credential-field-${f.key}`}
                      title={f.friendly_name ?? f.key}
                      description={[f.scope === 'user' ? 'Personal' : null, preview ?? (f.is_sensitive ? 'Hidden' : f.description)].filter(Boolean).join(' · ')}
                      descriptionNumberOfLines={2}
                      onPress={() => fieldNodes(f).length > 0 && setEditing(f)}
                      right={() => <View style={styles.right}>{statusTag(f)}</View>}
                    />
                  </React.Fragment>
                );
              })}
              </View>
            </Card>
          </>
        )}

        <Text variant="labelLarge" style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>Saved on</Text>
        <Card mode="outlined" style={styles.card}>
          <View>
          {credential.nodes.map((n, i) => {
            const missing = missingOn(credential, n);
            const on = ticked.includes(n.nodeId);
            return (
              <React.Fragment key={n.nodeId}>
                {i > 0 && <Divider />}
                <List.Item
                  testID={`credential-node-${n.nodeId}`}
                  title={nameOf(n.nodeId)}
                  description={missing.length ? `Needs ${joinNames(missing.map((f) => f.friendly_name ?? f.key))}` : 'Up to date'}
                  onPress={() =>
                    setUnticked((prev) => {
                      const next = new Set(prev);
                      if (on) next.add(n.nodeId);
                      else next.delete(n.nodeId);
                      return next;
                    })
                  }
                  left={() => (
                    <View style={styles.check}>
                      <Checkbox.Android status={on ? 'checked' : 'unchecked'} />
                    </View>
                  )}
                />
              </React.Fragment>
            );
          })}
          </View>
        </Card>
        <Text variant="bodySmall" style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}>
          Changes go to every ticked node.
        </Text>
      </ScrollView>

      {editing && (
        <SecretEditDialog
          visible
          onDismiss={() => setEditing(null)}
          onSaved={() => {
            const targets = fieldNodes(editing);
            setToast(`${editing.friendly_name ?? editing.key} saved on ${joinNames(targets.map(nameOf))}`);
            setEditing(null);
            refreshNodes(targets);
          }}
          nodeId={fieldNodes(editing)[0]}
          nodeIds={fieldNodes(editing)}
          accessToken={authState.accessToken ?? ''}
          secretKey={editing.key}
          title={editing.friendly_name ?? editing.key}
          savesTo={`Saves to ${joinNames(fieldNodes(editing).map(nameOf))}.`}
          description={editing.description}
          valueType={editing.value_type}
          scope={editing.scope}
          isSet={isSet(editing)}
          currentValue={editing.is_sensitive ? undefined : valueOf(editing.key)}
          enumValues={editing.enum_values}
          presets={editing.presets}
          onPresetsAvailable={applyPresets}
          householdMembers={members.data}
        />
      )}

      <Portal>
        <Modal visible={helpOpen} onDismiss={() => setHelpOpen(false)} contentContainerStyle={[styles.help, { backgroundColor: theme.colors.surface }]}>
          <Text variant="titleMedium" style={{ fontWeight: '600', marginBottom: 8 }}>{credential.name}</Text>
          <ScrollView>
            <Markdown style={{ body: { color: theme.colors.onSurface } }}>{credential.setupGuide ?? ''}</Markdown>
          </ScrollView>
          <Button onPress={() => setHelpOpen(false)} style={{ alignSelf: 'flex-end' }}>Close</Button>
        </Modal>
      </Portal>

      <Snackbar visible={!!toast} onDismiss={() => setToast('')} duration={3000} testID="credential-toast">
        {toast}
      </Snackbar>
    </View>
    </Portal.Host>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 32 },
  signIn: { marginBottom: 12 },
  label: { marginTop: 8, marginBottom: 6, marginLeft: 4 },
  card: { marginBottom: 8, overflow: 'hidden' },
  right: { justifyContent: 'center' },
  check: { justifyContent: 'center', marginLeft: 4 },
  hint: { marginHorizontal: 4, marginBottom: 12 },
  updating: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: 10, marginBottom: 10 },
  help: { margin: 20, padding: 20, borderRadius: 16, maxHeight: '80%' },
});

export default CredentialDetailScreen;
