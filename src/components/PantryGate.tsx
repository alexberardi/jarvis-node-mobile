/**
 * Gate in front of every Pantry screen (the whole Store stack): browse, detail,
 * node picker, install progress and the Forge test install.
 *
 * The household setting `pantry.enabled` (default off on jarvisd) decides
 * whether the Pantry is contacted at all. Until it is known the gate renders a
 * spinner and NOT its children, so no catalog fetch happens before the check
 * resolves. When off it renders an explanation instead — with an "Enable
 * Pantry" button for household admins (confirmed first) and an "ask an admin"
 * note for everyone else.
 *
 * Against the legacy Python stack the key is absent from the settings
 * response and the Pantry is treated as on (`pantryEnabledFromSettings`).
 *
 * Screens inside the gate call `usePantryGate().markDisabled()` when an install
 * comes back 403 `pantry_disabled` (the setting was flipped elsewhere); the
 * gate then swaps the stack for the disabled state. Outside a gate (unit
 * tests) that hook is a harmless no-op.
 */
import { useFocusEffect } from '@react-navigation/native';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Icon, Text, useTheme } from 'react-native-paper';

import {
  getHouseholdSettings,
  pantryEnabledFromSettings,
  setHouseholdSetting,
  settingErrorMessage,
} from '../api/householdSettingsApi';
import { useAuth } from '../auth/AuthContext';

export const PANTRY_DISABLED_MESSAGE =
  'The Pantry is turned off for this household.';
export const PANTRY_PRIVACY_NOTE =
  'Turning it on means this app, your nodes and your server contact the Pantry ' +
  'to browse and install packages. The Pantry sees your IP address and what you ' +
  'browse and install.';

interface PantryGateContextValue {
  /** Show the disabled state (e.g. after a 403 `pantry_disabled`). */
  markDisabled: () => void;
}

const PantryGateContext = createContext<PantryGateContextValue>({
  markDisabled: () => {},
});

export const usePantryGate = (): PantryGateContextValue => useContext(PantryGateContext);

type GateState = 'checking' | 'enabled' | 'disabled' | 'no-household' | 'error';

const isNotFound = (error: unknown): boolean =>
  (error as { response?: { status?: number } })?.response?.status === 404;

interface Props {
  children: React.ReactNode;
}

const PantryGate = ({ children }: Props) => {
  const theme = useTheme();
  const { state: authState } = useAuth();
  const householdId = authState.activeHouseholdId;
  const activeHousehold = authState.households?.find((h) => h.id === householdId);
  const isAdmin = activeHousehold?.role === 'admin';

  const [gate, setGate] = useState<GateState>('checking');
  const [enabling, setEnabling] = useState(false);
  // Ignore results for a household that is no longer active.
  const checkSeq = useRef(0);

  const check = useCallback(
    async (quiet: boolean) => {
      const seq = ++checkSeq.current;
      if (!householdId) {
        setGate('no-household');
        return;
      }
      if (!quiet) setGate('checking');
      try {
        const settings = await getHouseholdSettings(householdId);
        if (seq !== checkSeq.current) return;
        setGate(pantryEnabledFromSettings(settings) ? 'enabled' : 'disabled');
      } catch (error) {
        if (seq !== checkSeq.current) return;
        // A server with no household-settings endpoint at all predates the
        // gate entirely — keep its old behaviour.
        if (isNotFound(error)) {
          setGate('enabled');
          return;
        }
        console.warn('[PantryGate] Failed to read household settings', error);
        // A quiet re-check keeps whatever was already decided.
        if (!quiet) setGate('error');
      }
    },
    [householdId],
  );

  // Fresh check whenever the household changes; quiet re-check on refocus so a
  // flip made elsewhere is picked up without flashing a spinner.
  useEffect(() => {
    check(false);
  }, [check]);

  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      check(true);
    }, [check]),
  );

  const markDisabled = useCallback(() => {
    checkSeq.current++;
    setGate('disabled');
  }, []);

  const enable = useCallback(async () => {
    if (!householdId) return;
    setEnabling(true);
    try {
      await setHouseholdSetting(householdId, 'pantry.enabled', true);
      checkSeq.current++;
      setGate('enabled');
    } catch (error) {
      Alert.alert('Error', settingErrorMessage(error, 'Could not turn on the Pantry'));
    } finally {
      setEnabling(false);
    }
  }, [householdId]);

  const confirmEnable = useCallback(() => {
    Alert.alert(
      'Enable Pantry?',
      `${PANTRY_PRIVACY_NOTE}\n\nThis turns it on for everyone in the household.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Enable', onPress: () => { void enable(); } },
      ],
    );
  }, [enable]);

  if (gate === 'enabled') {
    return (
      <PantryGateContext.Provider value={{ markDisabled }}>
        {children}
      </PantryGateContext.Provider>
    );
  }

  if (gate === 'checking') {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" testID="pantry-gate-checking" />
      </View>
    );
  }

  const muted = { color: theme.colors.onSurfaceVariant };

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      testID="pantry-gate"
    >
      <Icon source="package-variant-closed" size={48} color={theme.colors.onSurfaceVariant} />
      <Text variant="headlineSmall" style={styles.title}>
        Pantry
      </Text>

      {gate === 'error' && (
        <>
          <Text variant="bodyMedium" style={[styles.body, muted]}>
            Couldn't check whether the Pantry is on for this household.
          </Text>
          <Button mode="text" onPress={() => check(false)} style={styles.button}>
            Retry
          </Button>
        </>
      )}

      {gate === 'no-household' && (
        <Text variant="bodyMedium" style={[styles.body, muted]}>
          Join or create a household to use the Pantry.
        </Text>
      )}

      {gate === 'disabled' && (
        <>
          <Text variant="bodyLarge" style={styles.body}>
            {PANTRY_DISABLED_MESSAGE}
          </Text>
          <Text variant="bodyMedium" style={[styles.body, muted]}>
            {PANTRY_PRIVACY_NOTE}
          </Text>
          {isAdmin ? (
            <Button
              mode="contained"
              icon="package-variant"
              onPress={confirmEnable}
              loading={enabling}
              disabled={enabling}
              style={styles.button}
              testID="pantry-enable-button"
            >
              Enable Pantry
            </Button>
          ) : (
            <Text variant="bodyMedium" style={[styles.body, muted]}>
              Ask a household admin to turn on the Pantry.
            </Text>
          )}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  title: { fontWeight: 'bold' },
  body: { textAlign: 'center' },
  button: { marginTop: 8 },
});

export default PantryGate;
