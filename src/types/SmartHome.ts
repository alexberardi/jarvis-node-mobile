export interface Room {
  id: string;
  household_id: string;
  name: string;
  normalized_name: string;
  icon: string | null;
  ha_area_id: string | null;
  parent_room_id: string | null;
  device_count: number;
  node_count: number;
  created_at: string;
  updated_at: string;
}

// HA data types from REST API
export interface HAArea {
  area_id: string;
  name: string;
  aliases: string[];
  picture: string | null;
}

export interface HADevice {
  id: string;
  name: string | null;
  name_by_user: string | null;
  manufacturer: string | null;
  model: string | null;
  area_id: string | null;
  disabled_by: string | null;
}

export interface HAEntity {
  entity_id: string;
  name: string | null;
  original_name: string | null;
  platform: string;
  device_id: string | null;
  area_id: string | null;
  disabled_by: string | null;
}

export interface HAState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}

export interface DeviceImportItem {
  entity_id: string;
  name: string;
  domain: string;
  room_id?: string;
  device_class?: string;
  manufacturer?: string;
  model?: string;
  ha_device_id?: string;
  source: 'home_assistant' | 'direct';
  protocol?: string;       // e.g., "lifx", "kasa", "tuya"
  local_ip?: string;       // LAN address
  mac_address?: string;    // MAC for stable identity
  cloud_id?: string;       // Cloud-only device ID (Govee, Nest, Schlage)
}

/** A device as returned by the CC device list API. */
export interface DeviceListItem {
  id: string;
  household_id: string;
  room_id: string | null;
  entity_id: string;
  name: string;
  domain: string;
  device_class: string | null;
  manufacturer: string | null;
  model: string | null;
  source: string;
  protocol: string | null;
  local_ip: string | null;
  mac_address: string | null;
  cloud_id: string | null;
  ha_device_id: string | null;
  is_controllable: boolean;
  is_active: boolean;
  room_name: string | null;
  supported_actions: JarvisButton[] | null;
  created_at: string;
  updated_at: string;
}

export interface RoomCreateRequest {
  name: string;
  icon?: string;
  ha_area_id?: string;
  parent_room_id?: string;
}

export interface RoomUpdateRequest {
  name?: string;
  icon?: string;
  parent_room_id?: string | null;
}

export interface ConfigPushRequest {
  config_type: string;
  ciphertext: string;
  nonce: string;
  tag: string;
}

/**
 * Declarative OAuth config from IJarvisCommand.authentication.
 * Mirrors the Python AuthenticationConfig dataclass.
 */
export interface AuthenticationConfig {
  type: string;                         // "oauth"
  provider: string;                     // "home_assistant", "spotify"
  friendly_name: string;                // "Home Assistant", "Spotify"
  client_id: string;                    // OAuth client ID
  keys: string[];                       // Keys to extract from token response

  // External OAuth (full URLs):
  authorize_url?: string;
  exchange_url?: string;

  // Local/discoverable OAuth (relative paths + discovery):
  authorize_path?: string;
  exchange_path?: string;
  discovery_port?: number;
  discovery_probe_path?: string;

  // OAuth extras:
  scopes?: string[];
  extra_authorize_params?: Record<string, string>;
  extra_exchange_params?: Record<string, string>;
  send_redirect_uri_in_exchange?: boolean;
  client_secret?: string;               // Web Application OAuth (server-side, for camera support)
  supports_pkce?: boolean;

  // Native app redirect: provider redirects to the app via custom URL scheme
  native_redirect_uri?: string;
}

/**
 * Integration status from the settings snapshot.
 * Built by the node from command auth configs + command_auth table.
 */
export interface IntegrationStatus {
  provider: string;
  needs_auth: boolean;
  auth_error: string | null;
  last_authed_at: string | null;
  authentication: AuthenticationConfig;
}

/**
 * Unified action button matching the IJarvisButton dataclass on the node.
 * Flows from node → CC → notifications → mobile.
 */
export interface JarvisButton {
  button_text: string;
  button_action: string;
  button_type: 'primary' | 'secondary' | 'destructive';
  button_icon?: string;
}

/**
 * Normalize a legacy {name, label, style} action or a new IJarvisButton
 * into the canonical JarvisButton shape. Provides backward compatibility
 * for cached inbox items that use the old format.
 */
export function normalizeButton(raw: unknown): JarvisButton {
  const r = raw as Record<string, unknown>;
  const rawType = (r.button_type ?? r.style ?? 'primary') as string;
  const validTypes: JarvisButton['button_type'][] = ['primary', 'secondary', 'destructive'];
  return {
    button_text: (r.button_text ?? r.label ?? '') as string,
    button_action: (r.button_action ?? r.name ?? '') as string,
    button_type: validTypes.includes(rawType as JarvisButton['button_type'])
      ? (rawType as JarvisButton['button_type'])
      : 'primary',
    button_icon: r.button_icon as string | undefined,
  };
}

/**
 * @deprecated Use JarvisButton instead. Kept as an alias for backward compat.
 */
export interface ResponseAction {
  name: string;
  label: string;
  style: 'primary' | 'secondary' | 'destructive';
}

/** A device discovered by a node's protocol adapters during a user-driven scan. */
export interface DiscoveredDeviceResult {
  name: string;
  domain: string;
  manufacturer: string | null;
  model: string | null;
  protocol: string | null;
  entity_id: string;
  local_ip: string | null;
  mac_address: string | null;
  cloud_id: string | null;
  device_class: string | null;
  is_controllable: boolean;
  already_registered: boolean;
  existing_device_id: string | null;
}

/** Normalized device state from CC, includes domain-specific UI hints. */
export interface DeviceState {
  entity_id: string;
  domain: string;
  state: Record<string, unknown> | null;
  ui_hints: {
    control_type: string;
    features: string[];
    min_value?: number;
    max_value?: number;
    step?: number;
    unit?: string;
  } | null;
  error: string | null;
}

export interface DeviceScanPollResponse {
  status: 'pending' | 'completed' | 'failed';
  request_id: string;
  devices?: DiscoveredDeviceResult[];
  device_count?: number;
  error_message?: string;
}

/** A device returned by the device-list MQTT flow (external/node-managed). */
export interface ExternalDeviceItem {
  name: string;
  domain: string;
  entity_id: string;
  is_controllable: boolean;
  manufacturer: string | null;
  model: string | null;
  protocol: string | null;
  local_ip: string | null;
  mac_address: string | null;
  cloud_id: string | null;
  device_class: string | null;
  source: string;
  area: string | null;
  state: string | null;
  already_registered: boolean;
  existing_device_id: string | null;
  room_id: string | null;
  room_name: string | null;
  supported_actions: JarvisButton[] | null;
}

/** Poll response for device-list requests (external devices via MQTT). */
export interface DeviceListPollResponse {
  status: 'pending' | 'completed' | 'failed';
  request_id: string;
  manager_name: string | null;
  can_edit_devices: boolean | null;
  devices: ExternalDeviceItem[] | null;
  device_count: number | null;
  error_message: string | null;
}

// Enriched entity for display in import screen
export interface EnrichedEntity {
  entity_id: string;
  name: string;
  domain: string;
  device_class: string | null;
  manufacturer: string | null;
  model: string | null;
  ha_device_id: string | null;
  area_id: string | null;
  area_name: string | null;
  state: string | null;
  selected: boolean;
}
