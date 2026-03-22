import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Appbar,
  Button,
  Card,
  Chip,
  Dialog,
  IconButton,
  Menu,
  Portal,
  SegmentedButtons,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';

import authApi from '../../api/authApi';
import { useAuth } from '../../auth/AuthContext';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'HouseholdEdit'>;

interface Member {
  user_id: number;
  username: string;
  email: string;
  role: string;
}

interface InviteCode {
  id: number;
  code: string;
  default_role: string;
  max_uses: number | null;
  use_count: number;
  expires_at: string;
  revoked: boolean;
  created_at: string;
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  power_user: 'Power User',
  member: 'Member',
};

const HouseholdEditScreen = ({ navigation, route }: Props) => {
  const { householdId, householdName } = route.params;
  const theme = useTheme();
  const { state: authState, fetchHouseholds } = useAuth();

  // Household name
  const [name, setName] = useState(householdName);
  const [savingName, setSavingName] = useState(false);

  // Members
  const [members, setMembers] = useState<Member[]>([]);
  const [roleMenuUser, setRoleMenuUser] = useState<number | null>(null);

  // Invites
  const [invites, setInvites] = useState<InviteCode[]>([]);
  const [showCreateInvite, setShowCreateInvite] = useState(false);
  const [inviteRole, setInviteRole] = useState('member');
  const [inviteExpiry, setInviteExpiry] = useState('7');
  const [inviteMaxUses, setInviteMaxUses] = useState('');
  const [creatingInvite, setCreatingInvite] = useState(false);

  // Loading / error state for members + invites
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersError, setMembersError] = useState<string | null>(null);

  const headers = { Authorization: `Bearer ${authState.accessToken}` };
  const currentUser = authState.user;
  const currentMember = members.find((m) => m.user_id === currentUser?.id);
  const isAdmin = currentMember?.role === 'admin';
  const canInvite = isAdmin || currentMember?.role === 'power_user';

  // Load members and invites — always fetch both, filter invite display via canInvite
  const loadMembersAndInvites = useCallback(async () => {
    setMembersLoading(true);
    setMembersError(null);
    try {
      const [membersRes, invitesRes] = await Promise.all([
        authApi.get<Member[]>(`/households/${householdId}/members`, { headers }),
        authApi.get<InviteCode[]>(`/households/${householdId}/invites`, { headers }).catch(() => ({ data: [] as InviteCode[] })),
      ]);
      setMembers(membersRes.data);
      setInvites(invitesRes.data);
    } catch (error) {
      console.error('[HouseholdEditScreen] Failed to load members/invites', error);
      setMembersError('Could not load household data.');
    } finally {
      setMembersLoading(false);
    }
  }, [householdId, authState.accessToken]);

  useEffect(() => {
    loadMembersAndInvites();
  }, [loadMembersAndInvites]);

  // Save name
  const handleSaveName = useCallback(async () => {
    if (!name.trim() || name.trim() === householdName) return;
    setSavingName(true);
    try {
      await authApi.patch(`/households/${householdId}`, { name: name.trim() }, { headers });
      fetchHouseholds();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Failed to update';
      Alert.alert('Error', msg);
    } finally {
      setSavingName(false);
    }
  }, [householdId, name, householdName, headers, fetchHouseholds]);

  // Change role
  const handleChangeRole = useCallback(async (userId: number, role: string) => {
    setRoleMenuUser(null);
    try {
      await authApi.patch(`/households/${householdId}/members/${userId}`, { role }, { headers });
      setMembers((prev) => prev.map((m) => m.user_id === userId ? { ...m, role } : m));
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Failed to update role';
      Alert.alert('Error', msg);
    }
  }, [householdId, headers]);

  // Remove member
  const handleRemoveMember = useCallback((userId: number, email: string) => {
    Alert.alert('Remove Member', `Remove ${email} from this household?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await authApi.delete(`/households/${householdId}/members/${userId}`, { headers });
            setMembers((prev) => prev.filter((m) => m.user_id !== userId));
          } catch (err: unknown) {
            const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Failed to remove';
            Alert.alert('Error', msg);
          }
        },
      },
    ]);
  }, [householdId, headers]);

  // Create invite
  const handleCreateInvite = useCallback(async () => {
    setCreatingInvite(true);
    try {
      const body: Record<string, unknown> = {
        default_role: inviteRole,
        expires_in_days: parseInt(inviteExpiry, 10) || 7,
      };
      if (inviteMaxUses.trim()) {
        body.max_uses = parseInt(inviteMaxUses, 10);
      }
      const res = await authApi.post<InviteCode>(`/households/${householdId}/invites`, body, { headers });
      setInvites((prev) => [res.data, ...prev]);
      setShowCreateInvite(false);
      setInviteMaxUses('');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Failed to create invite';
      Alert.alert('Error', msg);
    } finally {
      setCreatingInvite(false);
    }
  }, [householdId, inviteRole, inviteExpiry, inviteMaxUses, headers]);

  // Revoke invite
  const handleRevokeInvite = useCallback((invite: InviteCode) => {
    Alert.alert('Revoke Invite', `Revoke code ${invite.code}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke',
        style: 'destructive',
        onPress: async () => {
          try {
            await authApi.delete(`/households/${householdId}/invites/${invite.id}`, { headers });
            setInvites((prev) => prev.map((i) => i.id === invite.id ? { ...i, revoked: true } : i));
          } catch {
            Alert.alert('Error', 'Failed to revoke invite');
          }
        },
      },
    ]);
  }, [householdId, headers]);

  const formatExpiry = (iso: string) => {
    const date = new Date(iso);
    const now = new Date();
    if (date < now) return 'Expired';
    const days = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Expires today';
    if (days === 1) return 'Expires tomorrow';
    return `Expires in ${days} days`;
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Household Settings" />
      </Appbar.Header>

      <Portal.Host>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={membersLoading} onRefresh={loadMembersAndInvites} />}
      >
        {/* Name */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>Name</Text>
            <View style={styles.nameRow}>
              <TextInput
                mode="outlined"
                value={name}
                onChangeText={setName}
                style={{ flex: 1 }}
                dense
                disabled={!isAdmin}
              />
              {isAdmin && (
                <Button
                  mode="contained-tonal"
                  onPress={handleSaveName}
                  loading={savingName}
                  disabled={savingName || !name.trim() || name.trim() === householdName}
                  style={{ marginLeft: 8 }}
                  compact
                >
                  Save
                </Button>
              )}
            </View>
          </Card.Content>
        </Card>

        {/* Members */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>Members</Text>
            {membersLoading && (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" />
                <Text variant="bodySmall" style={{ marginLeft: 8, opacity: 0.6 }}>Loading members...</Text>
              </View>
            )}
            {membersError && !membersLoading && (
              <View style={{ marginBottom: 12 }}>
                <Text variant="bodySmall" style={{ color: theme.colors.error, marginBottom: 8 }}>{membersError}</Text>
                <Button mode="outlined" compact onPress={loadMembersAndInvites}>Retry</Button>
              </View>
            )}
            {!membersLoading && !membersError && members.map((m) => (
              <View key={m.user_id} style={styles.memberRow}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium">{m.username || m.email}</Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {m.email}
                  </Text>
                </View>
                {isAdmin && m.user_id !== currentUser?.id ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Menu
                      visible={roleMenuUser === m.user_id}
                      onDismiss={() => setRoleMenuUser(null)}
                      anchor={
                        <Chip compact onPress={() => setRoleMenuUser(m.user_id)}>
                          {ROLE_LABELS[m.role] || m.role}
                        </Chip>
                      }
                    >
                      <Menu.Item title="Admin" onPress={() => handleChangeRole(m.user_id, 'admin')} />
                      <Menu.Item title="Power User" onPress={() => handleChangeRole(m.user_id, 'power_user')} />
                      <Menu.Item title="Member" onPress={() => handleChangeRole(m.user_id, 'member')} />
                    </Menu>
                    <IconButton
                      icon="close"
                      size={18}
                      onPress={() => handleRemoveMember(m.user_id, m.email)}
                    />
                  </View>
                ) : (
                  <Chip compact>{ROLE_LABELS[m.role] || m.role}</Chip>
                )}
              </View>
            ))}
          </Card.Content>
        </Card>

        {/* Invite Codes */}
        {canInvite && (
          <Card style={styles.card}>
            <Card.Content>
              <View style={styles.inviteHeader}>
                <Text variant="titleMedium" style={[styles.sectionTitle, { flex: 1, marginBottom: 0 }]}>
                  Invite Codes
                </Text>
                <Button
                  mode="contained-tonal"
                  compact
                  icon="plus"
                  onPress={() => setShowCreateInvite(true)}
                >
                  Create
                </Button>
              </View>

              {invites.length === 0 && (
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}>
                  No invite codes yet. Create one to invite others to this household.
                </Text>
              )}

              {invites.map((invite) => (
                <View key={invite.id} style={styles.inviteRow}>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyMedium" style={{ fontFamily: 'monospace', letterSpacing: 2 }}>
                      {invite.code}
                    </Text>
                    <View style={styles.inviteMeta}>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        {ROLE_LABELS[invite.default_role] || invite.default_role}
                      </Text>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        {invite.max_uses ? `${invite.use_count}/${invite.max_uses} used` : `${invite.use_count} used`}
                      </Text>
                      <Text variant="bodySmall" style={{ color: invite.revoked ? theme.colors.error : theme.colors.onSurfaceVariant }}>
                        {invite.revoked ? 'Revoked' : formatExpiry(invite.expires_at)}
                      </Text>
                    </View>
                  </View>
                  {!invite.revoked && (
                    <IconButton
                      icon="close"
                      size={18}
                      onPress={() => handleRevokeInvite(invite)}
                    />
                  )}
                </View>
              ))}
            </Card.Content>
          </Card>
        )}
      </ScrollView>

      {/* Create Invite Dialog */}
      <Portal>
        <Dialog visible={showCreateInvite} onDismiss={() => setShowCreateInvite(false)}>
          <Dialog.Title>Create Invite Code</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodySmall" style={{ marginBottom: 12, color: theme.colors.onSurfaceVariant }}>
              Share the generated code with someone to let them join this household.
            </Text>

            <Text variant="labelMedium" style={styles.dialogLabel}>Default Role</Text>
            <SegmentedButtons
              value={inviteRole}
              onValueChange={setInviteRole}
              density="small"
              buttons={[
                { value: 'member', label: 'Member' },
                { value: 'power_user', label: 'Power User' },
              ]}
            />

            <Text variant="labelMedium" style={[styles.dialogLabel, { marginTop: 16 }]}>Expires In (days)</Text>
            <SegmentedButtons
              value={inviteExpiry}
              onValueChange={setInviteExpiry}
              density="small"
              buttons={[
                { value: '1', label: '1' },
                { value: '7', label: '7' },
                { value: '30', label: '30' },
                { value: '90', label: '90' },
              ]}
            />

            <TextInput
              mode="outlined"
              label="Max Uses (optional)"
              value={inviteMaxUses}
              onChangeText={setInviteMaxUses}
              keyboardType="numeric"
              dense
              style={{ marginTop: 16 }}
              placeholder="Unlimited"
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowCreateInvite(false)}>Cancel</Button>
            <Button onPress={handleCreateInvite} loading={creatingInvite} disabled={creatingInvite}>
              Create
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      </Portal.Host>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 48 },
  card: { marginBottom: 16 },
  sectionTitle: { fontWeight: '600', marginBottom: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  inviteHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  inviteMeta: { flexDirection: 'row', gap: 12, marginTop: 2 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  dialogLabel: { marginBottom: 6, fontWeight: '500' },
});

export default HouseholdEditScreen;
