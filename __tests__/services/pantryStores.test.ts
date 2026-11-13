import AsyncStorage from '@react-native-async-storage/async-storage';

import * as serviceConfig from '../../src/config/serviceConfig';
import {
  activeStore,
  activeStoreId,
  pickPantryStore,
  resetPantryStores,
  setPantryStores,
  storeLock,
  storeNote,
  storesFromSettings,
} from '../../src/services/pantryStores';

const base: serviceConfig.ServiceConfig = {
  authBaseUrl: 'http://a',
  commandCenterUrl: 'http://cc',
  configServiceUrl: null,
  notificationsUrl: '',
  pantryUrl: 'https://pantry-api.jarvisautomation.io',
};
const pub = { id: 'a1', url: 'https://pantry-api.jarvisautomation.io', name: 'Public Pantry' };
const shop = { id: 'b2', url: 'http://10.0.0.5:7721', name: 'Workshop' };

beforeEach(async () => {
  resetPantryStores();
  serviceConfig.setServiceConfig(base);
  await AsyncStorage.clear();
});

describe('storesFromSettings', () => {
  it("prefers the household's list, then the server's, then the single URL", () => {
    serviceConfig.setServiceConfig({ ...base, pantries: [pub] });
    expect(storesFromSettings({ 'pantry.stores': [shop, { id: 'x' }] })).toEqual([shop]);
    expect(storesFromSettings({})).toEqual([pub]);
    serviceConfig.setServiceConfig(base);
    expect(storesFromSettings(null)).toEqual([{ id: '', url: base.pantryUrl, name: 'Pantry' }]);
  });

  it('keeps an empty household list empty: no fallback to the public Pantry', () => {
    expect(storesFromSettings({ 'pantry.stores': [] })).toEqual([]);
  });
});

describe('the picked store', () => {
  it('names no store to the server with only one', async () => {
    await setPantryStores('hh1', [pub]);
    expect(activeStore()).toEqual(pub);
    expect(activeStoreId()).toBeUndefined();
  });

  it('defaults to the first, remembers a pick per household, and falls back when it is removed', async () => {
    await setPantryStores('hh1', [pub, shop]);
    expect(activeStoreId()).toBe('a1');
    pickPantryStore('b2');
    expect(activeStoreId()).toBe('b2');

    await setPantryStores('hh2', [pub, shop]);
    expect(activeStoreId()).toBe('a1');
    await setPantryStores('hh1', [pub, shop]);
    expect(activeStoreId()).toBe('b2');

    await setPantryStores('hh1', [pub, { ...shop, id: 'c3' }]);
    expect(activeStoreId()).toBe('a1');
  });

  it("never sends the single URL's id-less entry", async () => {
    await setPantryStores('hh1', storesFromSettings(null));
    expect(activeStore()?.url).toBe(base.pantryUrl);
    expect(activeStoreId()).toBeUndefined();
  });
});

describe('storeLock', () => {
  it('locks a package whose store was removed, or that came from another store', async () => {
    await setPantryStores('hh1', [pub, shop]);
    pickPantryStore('b2');
    expect(storeLock({ name: 'weather', version: '1.0.0', pantry_store_id: 'x', pantry_store_removed: true })).toMatch(
      /store was removed/,
    );
    expect(storeLock({ name: 'weather', version: '1.0.0', pantry_store_id: 'a1', pantry_store_name: 'Public Pantry' })).toBe(
      'Installed from Public Pantry. Pick that store to update it.',
    );
    expect(storeLock({ name: 'weather', version: '1.0.0', pantry_store_id: 'b2', pantry_store_name: 'Workshop' })).toBeNull();
    expect(storeLock({ name: 'weather', version: '1.0.0' })).toBeNull();
    expect(storeLock(null)).toBeNull();
  });
});

describe('storeNote', () => {
  it('names the store only when there is a choice, and always says when it was removed', () => {
    const shop = { name: 'get_sports', version: '1.1.0', pantry_store_id: 'b2', pantry_store_name: 'Workshop' };
    expect(storeNote(shop, 2)).toBe('From Workshop');
    expect(storeNote(shop, 1)).toBeNull();
    expect(storeNote({ name: 'x', version: '1', pantry_store_id: 'z', pantry_store_removed: true }, 1)).toMatch(/removed/);
    expect(storeNote({ name: 'x', version: '1' }, 2)).toBeNull();
    expect(storeNote(undefined, 2)).toBeNull();
  });
});
