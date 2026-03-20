/**
 * Generic network discovery service.
 *
 * Scans the local /24 subnet for a service on a given port + probe path.
 * Used by the declarative auth framework to discover local services
 * (e.g., Home Assistant on port 8123, or any other local OAuth provider).
 */
import * as Network from 'expo-network';

const PROBE_TIMEOUT_MS = 1500;
const DISCOVERY_TIMEOUT_MS = 15000;
const BATCH_SIZE = 20;

const PRIORITY_HOSTS = [1, 2, 10, 50, 100, 103, 150, 200];

export interface DiscoveryResult {
  found: boolean;
  url: string | null;
}

/**
 * Probe a single IP for a service on the given port and path.
 * Returns the base URL if the probe succeeds (HTTP 200 with JSON response).
 */
const probeHost = async (
  ip: string,
  port: number,
  probePath: string,
): Promise<string | null> => {
  const url = `http://${ip}:${port}${probePath}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (res.ok) {
      return `http://${ip}:${port}`;
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

const getSubnetPrefix = (ip: string): string => {
  const parts = ip.split('.');
  return parts.slice(0, 3).join('.');
};

/**
 * Scan the local /24 subnet for a service on the given port.
 */
const scanLocalNetwork = async (
  port: number,
  probePath: string,
  onProgress?: (scanned: number, total: number) => void,
): Promise<string | null> => {
  let deviceIp: string;
  try {
    deviceIp = await Network.getIpAddressAsync();
  } catch {
    return null;
  }

  if (!deviceIp || deviceIp === '0.0.0.0') return null;

  const subnet = getSubnetPrefix(deviceIp);
  let scanned = 0;
  const total = 254;

  // Probe priority hosts first
  const priorityIps = PRIORITY_HOSTS.map((h) => `${subnet}.${h}`);
  for (const ip of priorityIps) {
    const result = await probeHost(ip, port, probePath);
    scanned++;
    onProgress?.(scanned, total);
    if (result) return result;
  }

  // Build remaining hosts
  const prioritySet = new Set(PRIORITY_HOSTS);
  const remainingHosts: number[] = [];
  for (let i = 1; i < 255; i++) {
    if (!prioritySet.has(i)) {
      remainingHosts.push(i);
    }
  }

  // Scan in batches
  for (let batchStart = 0; batchStart < remainingHosts.length; batchStart += BATCH_SIZE) {
    const batch = remainingHosts.slice(batchStart, batchStart + BATCH_SIZE);
    const batchPromises = batch.map((h) => probeHost(`${subnet}.${h}`, port, probePath));
    const results = await Promise.all(batchPromises);
    scanned += batch.length;
    onProgress?.(Math.min(scanned, total), total);
    const found = results.find((r) => r !== null);
    if (found) return found;
  }

  return null;
};

/**
 * Discover a service on the local network by port and probe path.
 *
 * @param port - Port to scan (e.g., 8123 for Home Assistant)
 * @param probePath - Path to probe (e.g., "/api/" for HA)
 * @param onProgress - Progress callback (scanned, total)
 * @returns DiscoveryResult with found status and base URL
 */
export const discoverService = async (
  port: number,
  probePath: string,
  onProgress?: (scanned: number, total: number) => void,
): Promise<DiscoveryResult> => {
  const result = await Promise.race([
    scanLocalNetwork(port, probePath, onProgress),
    new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), DISCOVERY_TIMEOUT_MS),
    ),
  ]);

  return {
    found: result !== null,
    url: result,
  };
};
