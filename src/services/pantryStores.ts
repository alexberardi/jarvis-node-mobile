/**
 * The household's Pantry stores and the one this device picked (decision
 * 2026-11-11-several-pantries in jarvis-server). The app talks to the picked
 * store directly for browsing and downloads, and names it to jarvisd
 * (`pantry_store_id`) on install and Forge test install so the server installs
 * from the same store.
 *
 * Where the list comes from, best first: the household settings
 * (`pantry.stores`, read-only for members), then the server's `/services`
 * `pantries`, then today's single `jarvis-pantry` URL. An older server has
 * neither list, and the app behaves as it always did.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import type { InstalledPackage } from '../api/chatApi';
import { getHouseholdSettings } from '../api/householdSettingsApi';
import { PANTRY_URL } from '../config/env';
import { getServiceConfig, type PantryStore } from '../config/serviceConfig';
import { PANTRY_STORE_PICK_PREFIX } from '../config/storageKeys';

export type { PantryStore };

/** parsePantryStores keeps only whole `{id, url, name}` entries. */
export const parsePantryStores = (v: unknown): PantryStore[] =>
  Array.isArray(v)
    ? v.filter(
        (s): s is PantryStore =>
          !!s &&
          typeof s.id === 'string' &&
          typeof s.url === 'string' &&
          typeof s.name === 'string' &&
          s.url !== '',
      )
    : [];

/**
 * storesFromSettings is the household's list when its settings carry one, else
 * the server's, else the single URL (an id-less entry jarvisd never hears of).
 * A household list that is present but empty stays empty: that is the
 * "no store configured" state, never a fallback to the public Pantry.
 */
export const storesFromSettings = (settings: { 'pantry.stores'?: unknown } | null): PantryStore[] => {
  if (settings && 'pantry.stores' in settings) return parsePantryStores(settings['pantry.stores']);
  const { pantries, pantryUrl } = getServiceConfig();
  if (pantries !== undefined) return pantries;
  const url = pantryUrl || PANTRY_URL;
  return url ? [{ id: '', url, name: 'Pantry' }] : [];
};

interface State {
  householdId: string | null;
  stores: PantryStore[];
  pickedId: string | null;
  /** The list was read for this household (an empty list then means none configured). */
  loaded: boolean;
}

let state: State = { householdId: null, stores: [], pickedId: null, loaded: false };
const listeners = new Set<() => void>();

const set = (next: State) => {
  state = next;
  listeners.forEach((l) => l());
};

/** activeStore is the picked store, or the default (the first) when the pick is gone. */
export const activeStore = (): PantryStore | undefined =>
  state.stores.find((s) => s.id === state.pickedId) ?? state.stores[0];

/**
 * activeStoreId is what to send jarvisd as `pantry_store_id`: set only when
 * there is a choice. With one store the request stays as it was, so an older
 * server never sees the field.
 */
export const activeStoreId = (): string | undefined => {
  const s = activeStore();
  return state.stores.length > 1 && s?.id ? s.id : undefined;
};

/** setPantryStores records the household's list and restores this device's pick. */
export const setPantryStores = async (householdId: string, stores: PantryStore[]): Promise<void> => {
  let pickedId: string | null = null;
  try {
    pickedId = await AsyncStorage.getItem(PANTRY_STORE_PICK_PREFIX + householdId);
  } catch {
    // no pick to restore: the default
  }
  set({ householdId, stores, pickedId, loaded: true });
};

export const pickPantryStore = (id: string): void => {
  if (!state.householdId) return;
  AsyncStorage.setItem(PANTRY_STORE_PICK_PREFIX + state.householdId, id).catch(() => {});
  set({ ...state, pickedId: id });
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => state;

/** usePantryStores re-renders on a new list or pick. */
export const usePantryStores = () => {
  const s = useSyncExternalStore(subscribe, snapshot);
  return {
    stores: s.stores,
    store: s.stores.find((x) => x.id === s.pickedId) ?? s.stores[0],
    loaded: s.loaded,
    pick: pickPantryStore,
  };
};

/** For tests: forget everything. */
export const resetPantryStores = (): void => set({ householdId: null, stores: [], pickedId: null, loaded: false });

/**
 * loadPantryStores reads a household's list outside the Store tab (the Forge test on a node's
 * page). A server without household settings, or one that fails, leaves the server's list or
 * the single URL.
 */
export const loadPantryStores = async (householdId: string): Promise<void> => {
  let settings: { 'pantry.stores'?: unknown } | null = null;
  try {
    settings = await getHouseholdSettings(householdId);
  } catch {
    // fall back below
  }
  await setPantryStores(householdId, storesFromSettings(settings));
};

/**
 * storeLock says why a node can't install or update this package from the picked store, or null.
 * jarvisd refuses both (409): an update goes only to the store the package came from, and a
 * package whose store was removed has no updates until it is uninstalled.
 */
export const storeLock = (pkg: InstalledPackage | null | undefined): string | null => {
  if (!pkg) return null;
  if (pkg.pantry_store_removed) {
    return 'Its Pantry store was removed, so it has no updates. Uninstall it to install from another store.';
  }
  const picked = activeStoreId();
  if (picked && pkg.pantry_store_id && pkg.pantry_store_id !== picked) {
    return `Installed from ${pkg.pantry_store_name ?? 'another store'}. Pick that store to update it.`;
  }
  return null;
};

/**
 * storeNote says which store a node's package came from, for its row on the node's page: only
 * when the household has several stores, or when its store was removed (no updates).
 */
export const storeNote = (pkg: InstalledPackage | undefined, storeCount: number): string | null => {
  if (!pkg) return null;
  if (pkg.pantry_store_removed) return 'From a removed Pantry store, so no updates';
  if (storeCount > 1 && pkg.pantry_store_name) return `From ${pkg.pantry_store_name}`;
  return null;
};
