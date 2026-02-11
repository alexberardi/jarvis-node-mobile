import * as Network from 'expo-network';

import {
  ServiceConfig,
  CLOUD_CONFIG_URL,
  loadCachedConfig,
  cacheConfig,
  setServiceConfig,
} from '../config/serviceConfig';

const PROBE_TIMEOUT_MS = 1500;
const DISCOVERY_TIMEOUT_MS = 10000;
const CONFIG_SERVICE_PORTS = [8013, 8014, 8015, 8016, 8017, 8018, 8019, 8020];
const BATCH_SIZE = 20;

const PRIORITY_HOSTS = [1, 2, 10, 50, 100, 103, 150, 200];

interface ServiceEntry {
  name: string;
  url: string;
  host: string;
  port: number;
}

interface ServicesResponse {
  services: ServiceEntry[];
}

export interface DiscoveryResult {
  config: ServiceConfig;
  isCloud: boolean;
  fallbackMessage: string | null;
}

/**
 * Probe a single host:port for the Jarvis config service /info endpoint.
 * Returns the base URL if found, null otherwise.
 */
const probeHost = async (ip: string, port: number): Promise<string | null> => {
  const url = `http://${ip}:${port}/info`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const body = await res.json();
    if (body?.service === 'jarvis-config-service') {
      return `http://${ip}:${port}`;
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Fetch service URLs from a config service base URL.
 * Replaces localhost/127.0.0.1 in returned URLs with the config service's IP.
 */
const fetchServiceUrls = async (
  configBaseUrl: string,
): Promise<ServiceConfig | null> => {
  try {
    const res = await fetch(`${configBaseUrl}/services`);
    if (!res.ok) return null;
    const data: ServicesResponse = await res.json();

    // Extract the config service host IP for localhost replacement
    const configHost = new URL(configBaseUrl).hostname;

    let authBaseUrl = '';
    let commandCenterUrl = '';

    for (const svc of data.services) {
      // Replace localhost/127.0.0.1 in service URLs with the config host IP
      let svcUrl = svc.url;
      svcUrl = svcUrl.replace(/localhost|127\.0\.0\.1/, configHost);

      if (svc.name === 'jarvis-auth') {
        authBaseUrl = svcUrl;
      } else if (svc.name === 'jarvis-command-center') {
        commandCenterUrl = svcUrl;
      }
    }

    if (!authBaseUrl || !commandCenterUrl) return null;

    return {
      authBaseUrl,
      commandCenterUrl,
      configServiceUrl: configBaseUrl,
    };
  } catch {
    return null;
  }
};

/**
 * Derive the /24 subnet prefix from a device IP address.
 * e.g. "192.168.1.45" -> "192.168.1"
 */
const getSubnetPrefix = (ip: string): string => {
  const parts = ip.split('.');
  return parts.slice(0, 3).join('.');
};

/**
 * Scan the local network for a Jarvis config service.
 * Returns the config service base URL if found, null otherwise.
 */
const scanLocalNetwork = async (): Promise<string | null> => {
  let deviceIp: string;
  try {
    deviceIp = await Network.getIpAddressAsync();
  } catch {
    return null;
  }

  if (!deviceIp || deviceIp === '0.0.0.0') return null;

  const subnet = getSubnetPrefix(deviceIp);

  // Build priority host list
  const priorityIps = PRIORITY_HOSTS.map((h) => `${subnet}.${h}`);

  // Probe priority hosts first across all ports
  for (const ip of priorityIps) {
    const results = await Promise.all(
      CONFIG_SERVICE_PORTS.map((port) => probeHost(ip, port)),
    );
    const found = results.find((r) => r !== null);
    if (found) return found;
  }

  // Build remaining hosts (skip priority ones and skip .0 and .255)
  const prioritySet = new Set(PRIORITY_HOSTS);
  const remainingHosts: number[] = [];
  for (let i = 1; i < 255; i++) {
    if (!prioritySet.has(i)) {
      remainingHosts.push(i);
    }
  }

  // Scan remaining hosts in batches
  for (let batchStart = 0; batchStart < remainingHosts.length; batchStart += BATCH_SIZE) {
    const batch = remainingHosts.slice(batchStart, batchStart + BATCH_SIZE);
    const batchPromises = batch.flatMap((h) => {
      const ip = `${subnet}.${h}`;
      return CONFIG_SERVICE_PORTS.map((port) => probeHost(ip, port));
    });
    const results = await Promise.all(batchPromises);
    const found = results.find((r) => r !== null);
    if (found) return found;
  }

  return null;
};

/**
 * Main discovery function. Tiered strategy:
 * 1. Try cached config URL first (fast path)
 * 2. Scan local network for config service
 * 3. Fall back to cloud config
 */
export const discoverConfigService = async (): Promise<DiscoveryResult> => {
  // Tier 1: Try cached config
  const cached = await loadCachedConfig();
  if (cached?.configServiceUrl) {
    const validated = await fetchServiceUrls(cached.configServiceUrl);
    if (validated) {
      setServiceConfig(validated);
      return { config: validated, isCloud: false, fallbackMessage: null };
    }
  }

  // Tier 2: Scan local network (with timeout)
  const scanResult = await Promise.race([
    scanLocalNetwork(),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), DISCOVERY_TIMEOUT_MS)),
  ]);

  if (scanResult) {
    const config = await fetchServiceUrls(scanResult);
    if (config) {
      setServiceConfig(config);
      await cacheConfig(config);
      return { config, isCloud: false, fallbackMessage: null };
    }
  }

  // Tier 3: Fall back to cloud
  const cloudConfig = await fetchServiceUrls(CLOUD_CONFIG_URL);
  if (cloudConfig) {
    setServiceConfig(cloudConfig);
    return {
      config: cloudConfig,
      isCloud: true,
      fallbackMessage:
        'No local Jarvis server found. Using cloud services.',
    };
  }

  // Complete failure -- return empty config with message
  const emptyConfig: ServiceConfig = {
    authBaseUrl: '',
    commandCenterUrl: '',
    configServiceUrl: null,
  };
  setServiceConfig(emptyConfig);
  return {
    config: emptyConfig,
    isCloud: true,
    fallbackMessage:
      'Could not connect to any Jarvis services. Check that your server is running.',
  };
};
