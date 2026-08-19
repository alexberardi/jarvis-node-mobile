import Slider from '@react-native-community/slider';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
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
  Switch,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';

import authApi from '../../api/authApi';
import {
  getHouseholdSettings,
  getPersonaPresets,
  setHouseholdSetting,
  type PersonaPreset,
} from '../../api/householdSettingsApi';
import { useAuth } from '../../auth/AuthContext';
import type { RootStackParamList } from '../../navigation/types';
import {
  ensureBackgroundPermission,
  startHomeGeofence,
  stopHomeGeofence,
} from '../../services/backgroundPresenceTask';
import {
  ensureNotifyPermission,
  isPresenceNotifyEnabled,
  setPresenceNotifyEnabled,
} from '../../services/presenceNotifications';
import {
  captureCurrentLocation,
  clearHomeGeofence,
  clearLastPresenceState,
  getHomeGeofence,
  getLastPresenceState,
  isBackgroundPresenceEnabled,
  reportIfChanged,
  setHomeGeofence,
  DEFAULT_RADIUS_METERS,
  MAX_RADIUS_METERS,
  MIN_RADIUS_METERS,
  type HomeGeofence,
} from '../../services/presenceService';

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
  const { state: authState, fetchHouseholds, setBackgroundPresence } = useAuth();

  // Household name
  const [name, setName] = useState(householdName);
  const [savingName, setSavingName] = useState(false);

  // Web search (household-scoped feature toggle, default off)
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [webSearchLoading, setWebSearchLoading] = useState(true);
  const [savingWebSearch, setSavingWebSearch] = useState(false);
  const [location, setLocation] = useState('');
  const [savedLocation, setSavedLocation] = useState('');
  const [savingLocation, setSavingLocation] = useState(false);

  // Voice persona (household speaking style — shapes TONE only, not tools)
  const [persona, setPersona] = useState('');
  const [savedPersona, setSavedPersona] = useState('');
  const [savingPersona, setSavingPersona] = useState(false);
  const [personaPresets, setPersonaPresets] = useState<PersonaPreset[]>([]);
  const [personaDefaultId, setPersonaDefaultId] = useState<string | null>(null);
  const [personaMaxChars, setPersonaMaxChars] = useState(2000);

  // Home presence (device-local geofence — the precise coordinate never leaves
  // this phone; only home/away is ever reported). Opt-in: `enabled` defaults to
  // false and capturing a home does NOT auto-enable it — the user flips the
  // "Presence detection" switch themselves.
  const [homeGeo, setHomeGeo] = useState<HomeGeofence | null>(null);
  const [presenceLoading, setPresenceLoading] = useState(true);
  const [capturingHome, setCapturingHome] = useState(false);
  const [radius, setRadius] = useState(DEFAULT_RADIUS_METERS);
  // Background presence (Phase 3): true OS geofencing that fires even when the
  // app is closed. Separate opt-in from foreground "Presence detection" — it
  // needs Always-location permission and downgrades keychain accessibility.
  const [bgEnabled, setBgEnabled] = useState(false);
  const [bgBusy, setBgBusy] = useState(false);
  // Arrive/leave notifications (opt-in) + the live "Currently: home/away" status.
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const [notifyBusy, setNotifyBusy] = useState(false);
  const [currentPresence, setCurrentPresence] = useState<{ state: 'home' | 'away'; ts: number } | null>(null);

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

  // Leave household
  const [leaving, setLeaving] = useState(false);

  // Loading / error state for members + invites
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersError, setMembersError] = useState<string | null>(null);

  const headers = { Authorization: `Bearer ${authState.accessToken}` };
  const currentUser = authState.user;
  const currentMember = members.find((m) => m.user_id === currentUser?.id);
  const isAdmin = currentMember?.role === 'admin';
  const canInvite = isAdmin || currentMember?.role === 'power_user';
  const canLeave = (authState.households?.length ?? 0) > 1;

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

  // Load household-scoped feature settings (web search toggle)
  const loadHouseholdSettings = useCallback(async () => {
    setWebSearchLoading(true);
    try {
      const settings = await getHouseholdSettings(householdId);
      setWebSearchEnabled(!!settings['web_search.enabled']);
      const loc = settings['household.location'] ?? '';
      setLocation(loc);
      setSavedLocation(loc);
      const voice = settings['persona.household_prompt'] ?? '';
      setPersona(voice);
      setSavedPersona(voice);
    } catch (error) {
      console.error('[HouseholdEditScreen] Failed to load household settings', error);
    } finally {
      setWebSearchLoading(false);
    }
  }, [householdId]);

  useEffect(() => {
    loadHouseholdSettings();
  }, [loadHouseholdSettings]);

  // Load persona starter presets (best-effort — the box works without chips).
  useEffect(() => {
    let cancelled = false;
    getPersonaPresets(householdId)
      .then((p) => {
        if (cancelled) return;
        setPersonaPresets(p.presets ?? []);
        setPersonaDefaultId(p.default_preset_id ?? null);
        if (p.max_chars) setPersonaMaxChars(p.max_chars);
      })
      .catch((error) => {
        console.warn('[HouseholdEditScreen] Failed to load persona presets', error);
      });
    return () => {
      cancelled = true;
    };
  }, [householdId]);

  // Load the device-local home geofence (not household-scoped — it's per-phone)
  // and the background-presence opt-in.
  useEffect(() => {
    let cancelled = false;
    const activeHh = authState.activeHouseholdId;
    const uid = authState.user?.id;
    Promise.all([
      getHomeGeofence(),
      isBackgroundPresenceEnabled(),
      isPresenceNotifyEnabled(),
      activeHh && uid !== undefined ? getLastPresenceState(activeHh, uid) : Promise.resolve(null),
    ])
      .then(([g, bg, notify, cur]) => {
        if (cancelled) return;
        setHomeGeo(g);
        if (g) setRadius(g.radiusMeters);
        setBgEnabled(bg);
        setNotifyEnabled(notify);
        setCurrentPresence(cur);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setPresenceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the "Currently: home/away" line live-ish while the screen is open, so a
  // crossing shows up here too (the notification is the headline; this is the
  // in-app mirror). Cheap: a couple of AsyncStorage reads.
  useEffect(() => {
    const activeHh = authState.activeHouseholdId;
    const uid = authState.user?.id;
    if (!activeHh || uid === undefined) return;
    const refresh = () => {
      getLastPresenceState(activeHh, uid)
        .then((cur) => setCurrentPresence(cur))
        .catch(() => {});
    };
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
  }, [authState.activeHouseholdId, authState.user?.id]);

  // Fire an immediate presence sample so enabling (or re-pinning home while
  // enabled) reports right away, instead of waiting for the next app foreground.
  // Reports against the ACTIVE household (what usePresence uses); best-effort.
  const reportPresenceNow = useCallback(() => {
    const activeHh = authState.activeHouseholdId;
    const uid = authState.user?.id;
    if (!activeHh || uid === undefined) return;
    reportIfChanged(activeHh, uid, authState.user?.username).catch(() => {});
  }, [authState.activeHouseholdId, authState.user?.id, authState.user?.username]);

  // Tear background presence down consistently from every path (explicit
  // disable, rollback on a failed arm, foreground-presence-off, remove-home,
  // and a failed re-arm). Order matters: flip the UI switch OFF *first* so it
  // stays honest even if the token re-key or geofence stop throws — otherwise a
  // rejected SecureStore/AsyncStorage write would strand the switch "on" with
  // nothing monitoring. stopHomeGeofence never throws (self-caught); the token
  // re-key is best-effort (state reloads from storage on relaunch).
  const teardownBackgroundPresence = useCallback(async () => {
    setBgEnabled(false);
    await stopHomeGeofence();
    try {
      await setBackgroundPresence(false);
    } catch {
      /* best-effort — the opt-in flag reloads from storage on next launch */
    }
  }, [setBackgroundPresence]);

  // Capture (or update) the home coordinate from the phone's current position.
  // Prompts for location permission. Does NOT change the enabled flag — setting
  // a home and turning presence ON are deliberately separate, so nobody is
  // opted in just by pinning their home.
  const handleUseCurrentLocation = useCallback(async () => {
    setCapturingHome(true);
    try {
      const coord = await captureCurrentLocation();
      if (!coord) {
        Alert.alert(
          'Location permission needed',
          'Allow location access while using the app to set your home. You can grant it in your phone\'s Settings.',
        );
        return;
      }
      const next: HomeGeofence = {
        latitude: coord.latitude,
        longitude: coord.longitude,
        radiusMeters: radius,
        enabled: homeGeo?.enabled ?? false,
      };
      await setHomeGeofence(next);
      setHomeGeo(next);
      // If presence is already on, a new/updated home may flip the state — sample now.
      if (next.enabled) reportPresenceNow();
      // Re-arm the OS geofence around the new coordinate if background is on. If
      // the re-arm didn't take (e.g. Always permission was revoked meanwhile),
      // tear background down so the switch doesn't keep monitoring the OLD home.
      if (bgEnabled) {
        const res = await startHomeGeofence(next);
        if (res.status !== 'started') {
          await teardownBackgroundPresence();
          Alert.alert('Background presence off', 'Location access changed, so background detection was turned off. Turn it back on to re-enable.');
        }
      }
    } catch {
      Alert.alert('Error', 'Could not read your current location. Try again in a moment.');
    } finally {
      setCapturingHome(false);
    }
  }, [radius, homeGeo, reportPresenceNow, bgEnabled, teardownBackgroundPresence]);

  // The master opt-in. Only meaningful once a home is set (the switch is
  // disabled otherwise). Optimistic; reverts on failure.
  const handleTogglePresence = useCallback(async (next: boolean) => {
    if (!homeGeo) return;
    const updated: HomeGeofence = { ...homeGeo, enabled: next };
    setHomeGeo(updated);
    try {
      await setHomeGeofence(updated);
      if (next) {
        // Report immediately on opt-in rather than waiting for the next foreground.
        reportPresenceNow();
      } else {
        // Turning it off clears the remembered state so a later re-enable reports
        // a fresh edge instead of being masked by a stale "home".
        await clearLastPresenceState();
        // Foreground presence is the prerequisite for background presence, so
        // turning it off also tears background presence down.
        if (bgEnabled) await teardownBackgroundPresence();
      }
    } catch {
      setHomeGeo(homeGeo);
      Alert.alert('Error', 'Could not update presence detection.');
    }
  }, [homeGeo, reportPresenceNow, bgEnabled, teardownBackgroundPresence]);

  // Background presence opt-in. Only offered once foreground presence is on and
  // a home is set (the switch is hidden/disabled otherwise). Enabling walks the
  // two-step Always-location escalation, re-keys tokens for background access,
  // and arms the OS geofence; disabling stops it and restores accessibility.
  const handleToggleBgPresence = useCallback(async (next: boolean) => {
    if (!homeGeo) return;
    setBgBusy(true);
    try {
      if (next) {
        const granted = await ensureBackgroundPermission();
        if (!granted) {
          // The OS won't let the app force the "Always" prompt — point the user
          // at Settings. Leave the toggle off.
          Alert.alert(
            'Allow location “Always”',
            'Background presence needs location access set to “Always” so Jarvis can tell when you come and go while the app is closed. Grant it in Settings, then turn this on again.',
            [
              { text: 'Not now', style: 'cancel' },
              { text: 'Open Settings', onPress: () => { Linking.openSettings().catch(() => {}); } },
            ],
          );
          return;
        }
        // Persist the opt-in + re-key tokens BEFORE arming, so the headless task
        // can read/rotate them while locked.
        await setBackgroundPresence(true);
        setBgEnabled(true);
        let armed = false;
        try {
          const res = await startHomeGeofence(homeGeo);
          armed = res.status === 'started';
        } catch {
          armed = false;
        }
        if (!armed) {
          // The OS geofence didn't actually arm — roll back so we never leave
          // the switch "on" with tokens downgraded to background-readable but
          // nothing monitoring. Mirrors the optimistic-revert used by the other
          // toggles on this screen.
          await teardownBackgroundPresence();
          Alert.alert('Error', 'Could not start background presence. Please try again.');
          return;
        }
        // A fresh sample now so the current state is asserted immediately.
        reportPresenceNow();
      } else {
        await teardownBackgroundPresence();
      }
    } catch {
      Alert.alert('Error', 'Could not update background presence.');
    } finally {
      setBgBusy(false);
    }
  }, [homeGeo, reportPresenceNow, teardownBackgroundPresence]);

  // Arrive/leave notification opt-in. Requesting notification permission is an
  // explicit user action, so it happens here (the background task never prompts).
  const handleToggleNotify = useCallback(async (next: boolean) => {
    setNotifyBusy(true);
    try {
      if (next) {
        const granted = await ensureNotifyPermission();
        if (!granted) {
          Alert.alert(
            'Allow notifications',
            'Turn on notifications for Jarvis so it can tell you when you arrive at or leave home. You can enable it in your phone’s Settings.',
            [
              { text: 'Not now', style: 'cancel' },
              { text: 'Open Settings', onPress: () => { Linking.openSettings().catch(() => {}); } },
            ],
          );
          return;
        }
        await setPresenceNotifyEnabled(true);
        setNotifyEnabled(true);
      } else {
        await setPresenceNotifyEnabled(false);
        setNotifyEnabled(false);
      }
    } catch {
      Alert.alert('Error', 'Could not update arrival notifications.');
    } finally {
      setNotifyBusy(false);
    }
  }, []);

  // Persist the radius when the slider settles (not on every tick).
  const handleRadiusComplete = useCallback(async (value: number) => {
    const r = Math.round(value);
    setRadius(r);
    if (!homeGeo) return;
    const updated: HomeGeofence = { ...homeGeo, radiusMeters: r };
    setHomeGeo(updated);
    try {
      await setHomeGeofence(updated);
      // Re-arm the OS geofence with the new radius if background is on. If the
      // re-arm didn't take, tear background down so we don't keep monitoring the
      // OLD radius while the switch reads "on".
      if (bgEnabled) {
        const res = await startHomeGeofence(updated);
        if (res.status !== 'started') await teardownBackgroundPresence();
      }
    } catch {
      /* best-effort; the next save will reconcile */
    }
  }, [homeGeo, bgEnabled, teardownBackgroundPresence]);

  // Delete the on-device home + stop reporting.
  const handleRemoveHome = useCallback(() => {
    Alert.alert(
      'Remove home location',
      'Turn off presence detection and delete the home location stored on this phone?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            // Reset UI state in a finally so a rejected storage/keychain write
            // can't strand the card showing a home that's already been wiped.
            try {
              if (bgEnabled) await teardownBackgroundPresence();
              await clearHomeGeofence();
              await clearLastPresenceState();
            } catch {
              /* best-effort; state reloads from storage on relaunch */
            } finally {
              setHomeGeo(null);
              setRadius(DEFAULT_RADIUS_METERS);
            }
          },
        },
      ],
    );
  }, [bgEnabled, teardownBackgroundPresence]);

  // Toggle web search (optimistic; revert on failure)
  const handleToggleWebSearch = useCallback(async (next: boolean) => {
    setWebSearchEnabled(next);
    setSavingWebSearch(true);
    try {
      await setHouseholdSetting(householdId, 'web_search.enabled', next);
    } catch (err: unknown) {
      setWebSearchEnabled(!next);
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        ?? 'Failed to update web search setting';
      Alert.alert('Error', msg);
    } finally {
      setSavingWebSearch(false);
    }
  }, [householdId]);

  // Save the household's locality. Trimmed; saving the unchanged value is a
  // no-op so leaving the field alone never fires a write.
  const handleSaveLocation = useCallback(async () => {
    const next = location.trim();
    if (next === savedLocation) return;
    setSavingLocation(true);
    try {
      await setHouseholdSetting(householdId, 'household.location', next);
      setSavedLocation(next);
    } catch (err: unknown) {
      setLocation(savedLocation);
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        ?? 'Failed to update location';
      Alert.alert('Error', msg);
    } finally {
      setSavingLocation(false);
    }
  }, [householdId, location, savedLocation]);

  // Save the household's voice persona. Trimmed; saving the unchanged value is a
  // no-op. An empty box is a valid save — it clears the voice layer.
  const handleSavePersona = useCallback(async () => {
    const next = persona.trim();
    if (next === savedPersona.trim()) return;
    setSavingPersona(true);
    try {
      await setHouseholdSetting(householdId, 'persona.household_prompt', next);
      setSavedPersona(next);
      setPersona(next);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        ?? 'Failed to update voice';
      Alert.alert('Error', msg);
    } finally {
      setSavingPersona(false);
    }
  }, [householdId, persona, savedPersona]);

  // Tapping a starter chip loads its voice into the box (unsaved — the user
  // reviews, tweaks, then Saves). The default preset doubles as "reset".
  const handleLoadPreset = useCallback((preset: PersonaPreset) => {
    setPersona(preset.text);
  }, []);

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

  // Leave household
  const handleLeaveHousehold = useCallback(() => {
    const isLastMember = members.length === 1;
    const message = isLastMember
      ? 'You are the only member. This household and all its nodes will be deleted.'
      : 'You will lose access to this household\'s nodes and settings.';

    Alert.alert('Leave Household', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          setLeaving(true);
          try {
            await authApi.post(`/households/${householdId}/leave`, {}, { headers });
            fetchHouseholds();
            navigation.goBack();
          } catch (err: unknown) {
            const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Failed to leave household';
            Alert.alert('Error', msg);
          } finally {
            setLeaving(false);
          }
        },
      },
    ]);
  }, [householdId, members.length, headers, fetchHouseholds, navigation]);

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
            <View style={styles.inputRow}>
              <TextInput
                testID="household-name-input"
                mode="outlined"
                value={name}
                onChangeText={setName}
                style={{ flex: 1 }}
                dense
                disabled={!isAdmin}
              />
              {isAdmin && (
                <Button
                  testID="household-save-name"
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

        {/* Voice / personality */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>Voice</Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
              How Jarvis talks — its tone and personality. This shapes the way it
              speaks, not what it can do. Tap a starter to try it on, then tweak
              the wording however you like.
            </Text>
            {webSearchLoading ? (
              <ActivityIndicator size="small" />
            ) : (
              <>
                {personaPresets.length > 0 && (
                  <View style={styles.presetRow}>
                    {personaPresets.map((preset) => (
                      <Chip
                        key={preset.id}
                        testID={`persona-preset-${preset.id}`}
                        compact
                        mode="outlined"
                        icon={preset.id === personaDefaultId ? 'restore' : undefined}
                        selected={persona.trim() === preset.text.trim()}
                        onPress={() => handleLoadPreset(preset)}
                        disabled={!isAdmin}
                        style={styles.presetChip}
                      >
                        {preset.label}
                      </Chip>
                    ))}
                  </View>
                )}
                <TextInput
                  testID="household-persona-input"
                  mode="outlined"
                  value={persona}
                  onChangeText={setPersona}
                  multiline
                  numberOfLines={5}
                  maxLength={personaMaxChars}
                  placeholder="Describe how Jarvis should sound…"
                  disabled={!isAdmin}
                  style={styles.personaInput}
                />
                <View style={styles.personaFooter}>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {persona.length}/{personaMaxChars}
                  </Text>
                  {isAdmin && (
                    <Button
                      testID="household-save-persona"
                      mode="contained-tonal"
                      onPress={handleSavePersona}
                      loading={savingPersona}
                      disabled={savingPersona || persona.trim() === savedPersona.trim()}
                      compact
                    >
                      Save
                    </Button>
                  )}
                </View>
                {personaDefaultId && isAdmin && (
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
                    Tap the ↺ starter to restore the default voice.
                  </Text>
                )}
              </>
            )}
            {!isAdmin && !webSearchLoading && (
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}>
                Only a household admin can change this.
              </Text>
            )}
          </Card.Content>
        </Card>

        {/* Web Search */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>Web Search</Text>
            <View style={styles.toggleRow}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text variant="bodyMedium">Use web search</Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                  Let Jarvis search the internet to answer questions about current
                  events, prices, and recent news. When off, Jarvis answers only from
                  what it already knows — nothing leaves your network.
                </Text>
              </View>
              {webSearchLoading ? (
                <ActivityIndicator size="small" />
              ) : (
                <Switch
                  testID="household-web-search-toggle"
                  value={webSearchEnabled}
                  onValueChange={handleToggleWebSearch}
                  disabled={!isAdmin || savingWebSearch}
                />
              )}
            </View>
            {!isAdmin && !webSearchLoading && (
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}>
                Only a household admin can change this.
              </Text>
            )}
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>Location</Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
              Your town and state, so Jarvis finds the nearby business when it
              looks up a phone number. Not a street address — "Springfield, IL" or a
              ZIP code is enough.
            </Text>
            {webSearchLoading ? (
              <ActivityIndicator size="small" />
            ) : (
              <View style={styles.inputRow}>
                <TextInput
                  testID="household-location-input"
                  mode="outlined"
                  dense
                  value={location}
                  onChangeText={setLocation}
                  onSubmitEditing={handleSaveLocation}
                  placeholder="Springfield, IL 62704"
                  autoCapitalize="words"
                  returnKeyType="done"
                  style={{ flex: 1 }}
                  disabled={!isAdmin}
                />
                {isAdmin && (
                  <Button
                    testID="household-save-location"
                    mode="contained-tonal"
                    onPress={handleSaveLocation}
                    loading={savingLocation}
                    disabled={savingLocation || location.trim() === savedLocation}
                    style={{ marginLeft: 8 }}
                    compact
                  >
                    Save
                  </Button>
                )}
              </View>
            )}
            {!isAdmin && !webSearchLoading && (
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}>
                Only a household admin can change this.
              </Text>
            )}
          </Card.Content>
        </Card>

        {/* Home Presence (device-local, opt-in) */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>Home Presence</Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
              Let Jarvis know when you're home so it can respond to your presence.
              Your precise location is stored only on this phone — Jarvis only ever
              learns whether you're “home” or “away”. It's off until you turn it on.
            </Text>
            {presenceLoading ? (
              <ActivityIndicator size="small" />
            ) : (
              <>
                {/* The master opt-in switch. Disabled until a home is set so it
                    can never be turned on without a location to check against. */}
                <View style={styles.toggleRow}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text variant="bodyMedium">Presence detection</Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                      {!homeGeo
                        ? 'Set your home location below to enable this.'
                        : homeGeo.enabled
                          ? 'On — checked when you open the app.'
                          : 'Off — your location is not being used.'}
                    </Text>
                  </View>
                  <Switch
                    testID="presence-enabled-toggle"
                    value={!!homeGeo?.enabled}
                    onValueChange={handleTogglePresence}
                    disabled={!homeGeo}
                  />
                </View>

                {/* Background (Always) opt-in — offered only once foreground
                    presence is on. Detects home/away even when the app is
                    closed, using "Always" location. */}
                {homeGeo?.enabled && (
                  <View style={[styles.toggleRow, { marginTop: 12 }]}>
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <Text variant="bodyMedium">Detect in the background</Text>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                        {bgEnabled
                          ? 'On — detected even when the app is closed (uses “Always” location).'
                          : 'Off — only checked while the app is open. Needs “Always” location.'}
                      </Text>
                    </View>
                    <Switch
                      testID="presence-background-toggle"
                      value={bgEnabled}
                      onValueChange={handleToggleBgPresence}
                      disabled={bgBusy}
                    />
                  </View>
                )}

                {/* Arrive/leave notifications (opt-in) */}
                {homeGeo?.enabled && (
                  <View style={[styles.toggleRow, { marginTop: 12 }]}>
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <Text variant="bodyMedium">Notify me when I arrive / leave</Text>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                        {notifyEnabled
                          ? 'On — you’ll get a notification when you get home or leave.'
                          : 'Off — no arrival/departure notifications.'}
                      </Text>
                    </View>
                    <Switch
                      testID="presence-notify-toggle"
                      value={notifyEnabled}
                      onValueChange={handleToggleNotify}
                      disabled={notifyBusy}
                    />
                  </View>
                )}

                {/* Live presence status */}
                {homeGeo?.enabled && currentPresence && (
                  <View
                    testID="presence-current-status"
                    style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}
                  >
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 4,
                        marginRight: 8,
                        backgroundColor:
                          currentPresence.state === 'home' ? '#2e7d32' : theme.colors.onSurfaceVariant,
                      }}
                    />
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      Currently: {currentPresence.state === 'home' ? 'Home' : 'Away'}
                      {`  ·  since ${new Date(currentPresence.ts).toLocaleTimeString([], {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}`}
                    </Text>
                  </View>
                )}

                {/* Home location capture + radius */}
                <View style={{ marginTop: 16 }}>
                  <Text variant="bodyMedium" style={{ marginBottom: 4 }}>Home location</Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
                    {homeGeo
                      ? 'Saved on this phone. Stand at home and update it if it drifts.'
                      : 'Stand at home and tap below to save it on this phone.'}
                  </Text>
                  <View style={styles.inputRow}>
                    <Button
                      testID={homeGeo ? 'presence-update-location' : 'presence-set-location'}
                      mode="contained-tonal"
                      icon="crosshairs-gps"
                      onPress={handleUseCurrentLocation}
                      loading={capturingHome}
                      disabled={capturingHome}
                      compact
                    >
                      {homeGeo ? 'Update to current location' : 'Use my current location'}
                    </Button>
                    {homeGeo && (
                      <Button
                        testID="presence-remove"
                        mode="text"
                        textColor={theme.colors.error}
                        onPress={handleRemoveHome}
                        style={{ marginLeft: 8 }}
                        compact
                      >
                        Remove
                      </Button>
                    )}
                  </View>
                </View>

                {homeGeo && (
                  <View style={{ marginTop: 16 }}>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      Home radius: {radius} m
                    </Text>
                    <Slider
                      testID="presence-radius-slider"
                      style={{ marginTop: 4 }}
                      minimumValue={MIN_RADIUS_METERS}
                      maximumValue={MAX_RADIUS_METERS}
                      step={25}
                      value={radius}
                      onValueChange={(v) => setRadius(Math.round(v))}
                      onSlidingComplete={handleRadiusComplete}
                      minimumTrackTintColor={theme.colors.primary}
                    />
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                      How close you must be to count as home. A wider radius is
                      more forgiving of GPS drift.
                    </Text>
                  </View>
                )}
              </>
            )}
          </Card.Content>
        </Card>

        {/* Signal automations — free-text "when X happens, do Y" rules */}
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>Automations</Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
              Tell Jarvis what to do when something happens — like locking the door
              when you leave.
            </Text>
            <Button
              testID="open-signal-automations"
              mode="outlined"
              icon="robot"
              onPress={() => navigation.navigate('SignalAutomations', { householdId })}
            >
              Manage automations
            </Button>
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
                        <Chip testID={`member-role-chip-${m.user_id}`} compact onPress={() => setRoleMenuUser(m.user_id)}>
                          {ROLE_LABELS[m.role] || m.role}
                        </Chip>
                      }
                    >
                      <Menu.Item testID={`role-opt-${m.user_id}-admin`} title="Admin" onPress={() => handleChangeRole(m.user_id, 'admin')} />
                      <Menu.Item testID={`role-opt-${m.user_id}-power_user`} title="Power User" onPress={() => handleChangeRole(m.user_id, 'power_user')} />
                      <Menu.Item testID={`role-opt-${m.user_id}-member`} title="Member" onPress={() => handleChangeRole(m.user_id, 'member')} />
                    </Menu>
                    <IconButton
                      testID={`member-remove-${m.user_id}`}
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
                  testID="invite-create-open"
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
                      testID={`invite-revoke-${invite.id}`}
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

        {/* Leave Household */}
        {canLeave && (
          <Card style={[styles.card, { borderColor: theme.colors.error, borderWidth: 1 }]}>
            <Card.Content>
              <Text variant="titleSmall" style={{ color: theme.colors.error, marginBottom: 8 }}>
                Danger Zone
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
                Leave this household. You'll lose access to its nodes and settings.
                {members.length === 1 && ' This household will be deleted since you\'re the only member.'}
              </Text>
              <Button
                testID="household-leave"
                mode="outlined"
                textColor={theme.colors.error}
                style={{ borderColor: theme.colors.error }}
                onPress={handleLeaveHousehold}
                loading={leaving}
                icon="logout"
              >
                Leave Household
              </Button>
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
            <Button testID="invite-create-submit" onPress={handleCreateInvite} loading={creatingInvite} disabled={creatingInvite}>
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
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  toggleRow: { flexDirection: 'row', alignItems: 'center' },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  presetChip: { marginRight: 0 },
  personaInput: { minHeight: 96 },
  personaFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
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
