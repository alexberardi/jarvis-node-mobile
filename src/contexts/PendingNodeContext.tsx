/**
 * Tracks a node that was just provisioned and is still booting.
 *
 * Provisioning happens deep inside the Nodes tab, but the chat screen (Home
 * tab) is where the node needs to appear. Those screens live in different
 * navigators, so the "a new node is on its way" signal is hoisted to this
 * app-level context. The chat's NodeSelector reads `pendingNodeId` and polls
 * until the node registers + comes online, then auto-selects it — no app
 * restart required.
 *
 * The marker is scoped to the household it was created in (so switching
 * households doesn't leave the chat screen polling for a node that lives
 * elsewhere) and persisted with a TTL (so it survives the app being
 * backgrounded while the Pi boots, and self-expires if the node never shows).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import { PENDING_NODE_KEY } from '../config/storageKeys';

/** A freshly-provisioned Pi should register within minutes; expire after this. */
const PENDING_TTL_MS = 10 * 60 * 1000;

interface PersistedPending {
  nodeId: string;
  householdId: string | null;
  ts: number;
}

interface PendingNodeContextValue {
  /** node_id of a just-provisioned node still waiting to come online, or null. */
  pendingNodeId: string | null;
  /** Household the pending node belongs to (null for legacy markers). */
  pendingHouseholdId: string | null;
  /** Mark a node as pending — starts the chat screen polling for it. */
  markPending: (nodeId: string, householdId?: string | null) => void;
  /** Clear the pending marker (node arrived, or gave up). */
  clearPending: () => void;
}

const PendingNodeContext = createContext<PendingNodeContextValue>({
  pendingNodeId: null,
  pendingHouseholdId: null,
  markPending: () => {},
  clearPending: () => {},
});

export const usePendingNode = () => useContext(PendingNodeContext);

export const PendingNodeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [pendingNodeId, setPendingNodeId] = useState<string | null>(null);
  const [pendingHouseholdId, setPendingHouseholdId] = useState<string | null>(null);
  const expiryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearExpiry = useCallback(() => {
    if (expiryTimer.current) {
      clearTimeout(expiryTimer.current);
      expiryTimer.current = null;
    }
  }, []);

  const forget = useCallback(() => {
    setPendingNodeId(null);
    setPendingHouseholdId(null);
    AsyncStorage.removeItem(PENDING_NODE_KEY).catch(() => {});
  }, []);

  const clearPending = useCallback(() => {
    clearExpiry();
    forget();
  }, [clearExpiry, forget]);

  // Schedule auto-expiry `remainingMs` from now.
  const scheduleExpiry = useCallback(
    (remainingMs: number) => {
      clearExpiry();
      expiryTimer.current = setTimeout(forget, Math.max(0, remainingMs));
    },
    [clearExpiry, forget],
  );

  const markPending = useCallback(
    (nodeId: string, householdId: string | null = null) => {
      if (!nodeId) return;
      setPendingNodeId(nodeId);
      setPendingHouseholdId(householdId);
      const ts = Date.now();
      AsyncStorage.setItem(
        PENDING_NODE_KEY,
        JSON.stringify({ nodeId, householdId, ts } satisfies PersistedPending),
      ).catch(() => {});
      scheduleExpiry(PENDING_TTL_MS);
    },
    [scheduleExpiry],
  );

  // Rehydrate a still-valid pending marker on launch (covers the app being
  // killed/backgrounded while the node booted).
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(PENDING_NODE_KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        try {
          const parsed = JSON.parse(raw) as PersistedPending;
          const age = Date.now() - parsed.ts;
          if (parsed.nodeId && age < PENDING_TTL_MS) {
            setPendingNodeId(parsed.nodeId);
            setPendingHouseholdId(parsed.householdId ?? null);
            scheduleExpiry(PENDING_TTL_MS - age);
          } else {
            AsyncStorage.removeItem(PENDING_NODE_KEY).catch(() => {});
          }
        } catch {
          AsyncStorage.removeItem(PENDING_NODE_KEY).catch(() => {});
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      clearExpiry();
    };
  }, [scheduleExpiry, clearExpiry]);

  return (
    <PendingNodeContext.Provider
      value={{ pendingNodeId, pendingHouseholdId, markPending, clearPending }}
    >
      {children}
    </PendingNodeContext.Provider>
  );
};
