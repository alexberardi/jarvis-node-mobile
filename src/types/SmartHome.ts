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
  ha_device_id: string | null;
  is_controllable: boolean;
  is_active: boolean;
  room_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface RoomCreateRequest {
  name: string;
  icon?: string;
  ha_area_id?: string;
  parent_room_id?: string;
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
 * Interactive action button returned in a command response.
 * Rendered as tappable buttons below the response text.
 */
export interface ResponseAction {
  name: string;       // Action identifier (e.g. "send_click", "cancel_click")
  label: string;      // Button label (e.g. "Send", "Cancel")
  style: 'primary' | 'secondary' | 'destructive';
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
