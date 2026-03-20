import {
  HAArea,
  HADevice,
  HAEntity,
  HAState,
  EnrichedEntity,
} from '../types/SmartHome';

/**
 * Test connection to HA by hitting GET /api/ with the token.
 */
export const testConnection = async (
  url: string,
  token: string,
): Promise<{ success: boolean; version?: string; error?: string }> => {
  try {
    const res = await fetch(`${url}/api/`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}` };
    }
    const body = await res.json();
    return { success: true, version: body.version };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Connection failed',
    };
  }
};

/**
 * Fetch areas (rooms) from HA REST API.
 */
export const fetchAreas = async (
  url: string,
  token: string,
): Promise<HAArea[]> => {
  const res = await fetch(`${url}/api/config/area_registry/list`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  if (!res.ok) throw new Error(`Failed to fetch areas: HTTP ${res.status}`);
  return res.json();
};

/**
 * Fetch devices from HA REST API.
 */
export const fetchDevices = async (
  url: string,
  token: string,
): Promise<HADevice[]> => {
  const res = await fetch(`${url}/api/config/device_registry/list`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  if (!res.ok) throw new Error(`Failed to fetch devices: HTTP ${res.status}`);
  return res.json();
};

/**
 * Fetch entity registry from HA REST API.
 */
export const fetchEntities = async (
  url: string,
  token: string,
): Promise<HAEntity[]> => {
  const res = await fetch(`${url}/api/config/entity_registry/list`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  if (!res.ok)
    throw new Error(`Failed to fetch entities: HTTP ${res.status}`);
  return res.json();
};

/**
 * Fetch current states from HA REST API.
 */
export const fetchStates = async (
  url: string,
  token: string,
): Promise<HAState[]> => {
  const res = await fetch(`${url}/api/states`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to fetch states: HTTP ${res.status}`);
  return res.json();
};

// Domains that are controllable (not sensors)
const CONTROLLABLE_DOMAINS = new Set([
  'light',
  'switch',
  'cover',
  'lock',
  'climate',
  'fan',
  'media_player',
  'vacuum',
  'script',
  'scene',
  'input_boolean',
  'automation',
  'humidifier',
  'water_heater',
]);

/**
 * Fetch all HA data and build enriched entity list for import.
 */
export const fetchEnrichedEntities = async (
  url: string,
  token: string,
): Promise<{ entities: EnrichedEntity[]; areas: HAArea[] }> => {
  const [areas, devices, entities, states] = await Promise.all([
    fetchAreas(url, token),
    fetchDevices(url, token),
    fetchEntities(url, token),
    fetchStates(url, token),
  ]);

  const areaMap = new Map(areas.map((a) => [a.area_id, a.name]));
  const deviceMap = new Map(
    devices.map((d) => [
      d.id,
      {
        name: d.name_by_user || d.name,
        manufacturer: d.manufacturer,
        model: d.model,
        area_id: d.area_id,
      },
    ]),
  );
  const stateMap = new Map(states.map((s) => [s.entity_id, s]));

  const enriched: EnrichedEntity[] = [];

  for (const entity of entities) {
    if (entity.disabled_by) continue;

    const domain = entity.entity_id.split('.')[0];
    if (!CONTROLLABLE_DOMAINS.has(domain)) continue;

    const deviceInfo = entity.device_id
      ? deviceMap.get(entity.device_id)
      : null;
    const stateData = stateMap.get(entity.entity_id);

    // Resolve area: entity > device > null
    const areaId = entity.area_id || deviceInfo?.area_id || null;
    const areaName = areaId ? areaMap.get(areaId) || null : null;

    const name =
      entity.name ||
      entity.original_name ||
      stateData?.attributes?.friendly_name ||
      entity.entity_id;

    enriched.push({
      entity_id: entity.entity_id,
      name: typeof name === 'string' ? name : entity.entity_id,
      domain,
      device_class: null, // Could extract from state attributes
      manufacturer: deviceInfo?.manufacturer || null,
      model: deviceInfo?.model || null,
      ha_device_id: entity.device_id,
      area_id: areaId,
      area_name: areaName,
      state: stateData?.state || null,
      selected: true, // Default to selected
    });
  }

  return { entities: enriched, areas };
};

/**
 * Create a long-lived access token via HA WebSocket API.
 * Requires a valid (short-lived) access token from OAuth.
 */
export const createLongLivedToken = async (
  wsUrl: string,
  accessToken: string,
  clientName: string = 'Jarvis Node',
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let msgId = 1;

    ws.onopen = () => {
      // Wait for auth_required
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === 'auth_required') {
        ws.send(JSON.stringify({ type: 'auth', access_token: accessToken }));
      } else if (msg.type === 'auth_ok') {
        // Request long-lived token
        ws.send(
          JSON.stringify({
            id: msgId,
            type: 'auth/long_lived_access_token',
            client_name: clientName,
            lifespan: 365, // days
          }),
        );
      } else if (msg.type === 'auth_invalid') {
        ws.close();
        reject(new Error(msg.message || 'Authentication failed'));
      } else if (msg.id === msgId) {
        ws.close();
        if (msg.success && msg.result) {
          resolve(msg.result);
        } else {
          reject(
            new Error(
              msg.error?.message || 'Failed to create long-lived token',
            ),
          );
        }
      }
    };

    ws.onerror = () => {
      reject(new Error('WebSocket error'));
    };

    setTimeout(() => {
      ws.close();
      reject(new Error('Timeout creating long-lived token'));
    }, 15000);
  });
};
