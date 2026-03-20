/**
 * Home Assistant discovery service.
 *
 * Thin wrapper around the generic networkDiscoveryService for HA-specific
 * discovery on port 8123. Kept for backward compatibility with existing
 * HADiscoveryScreen usage.
 */
import { discoverService, type DiscoveryResult } from './networkDiscoveryService';

const HA_PORT = 8123;
const HA_PROBE_PATH = '/api/';

export type HADiscoveryResult = DiscoveryResult;

/**
 * Discover Home Assistant on the local network.
 * Returns the HA base URL (e.g., http://192.168.1.100:8123) if found.
 */
export const discoverHomeAssistant = async (
  onProgress?: (scanned: number, total: number) => void,
): Promise<HADiscoveryResult> => {
  return discoverService(HA_PORT, HA_PROBE_PATH, onProgress);
};

/**
 * Derive WS and REST URLs from a discovered HA base URL.
 */
export const deriveHAUrls = (
  baseUrl: string,
): { restUrl: string; wsUrl: string } => {
  const restUrl = baseUrl;
  // Replace http:// with ws://
  const wsUrl = baseUrl.replace(/^http/, 'ws') + '/api/websocket';
  return { restUrl, wsUrl };
};
