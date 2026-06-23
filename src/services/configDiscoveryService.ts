import * as Network from 'expo-network';
import Zeroconf, { Service as ZeroconfService } from 'react-native-zeroconf';

import {
  ServiceConfig,
  loadCachedConfig,
  loadManualConfigUrl,
  cacheConfig,
  setServiceConfig,
} from '../config/serviceConfig';
import { DEV_MODE, MANUAL_CONFIG_URL } from '../config/env';

const PROBE_TIMEOUT_MS = 1500;
const DISCOVERY_TIMEOUT_MS = 15000;
const FETCH_SERVICES_TIMEOUT_MS = 3000;
const MDNS_TIMEOUT_MS = 5000;
const MDNS_SERVICE_TYPE = 'jarvis-config';
const MDNS_SERVICE_PROTOCOL = 'tcp';
const CONFIG_SERVICE_PORTS = [7700];
const BATCH_SIZE = 50;

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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_SERVICES_TIMEOUT_MS);
  try {
    // Ask for the external (off-docker) URL style: config-service returns each
    // service's published coords (e.g. localhost:7701) instead of the internal
    // container coords (jarvis-auth:8000) the phone can't reach. We still run
    // the localhost→config-host rewrite below, which lands it on the reachable
    // host. Fall back to the plain endpoint for older config-service builds
    // that don't support the style (they 422 on the unknown enum).
    let res = await fetch(`${configBaseUrl}/services?style=external`, { signal: controller.signal });
    if (!res.ok) {
      res = await fetch(`${configBaseUrl}/services`, { signal: controller.signal });
    }
    if (!res.ok) return null;
    const data: ServicesResponse = await res.json();

    // Extract the config service host IP for localhost replacement
    const configHost = new URL(configBaseUrl).hostname;

    let authBaseUrl = '';
    let commandCenterUrl = '';
    let notificationsUrl = '';
    let pantryUrl = '';

    for (const svc of data.services) {
      // Replace localhost/127.0.0.1 in service URLs with the config host IP
      let svcUrl = svc.url;
      svcUrl = svcUrl.replace(/localhost|127\.0\.0\.1/, configHost);

      if (svc.name === 'jarvis-auth') {
        authBaseUrl = svcUrl;
      } else if (svc.name === 'jarvis-command-center') {
        commandCenterUrl = svcUrl;
      } else if (svc.name === 'jarvis-notifications') {
        notificationsUrl = svcUrl;
      } else if (svc.name === 'jarvis-pantry') {
        pantryUrl = svcUrl;
      }
    }

    if (!authBaseUrl || !commandCenterUrl) return null;

    return {
      authBaseUrl,
      commandCenterUrl,
      configServiceUrl: configBaseUrl,
      notificationsUrl,
      pantryUrl,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Browse the LAN via mDNS/Bonjour for a Jarvis config service advertised
 * under `_jarvis-config._tcp`. Returns a base URL on success, null on timeout
 * or failure. Verifies the resolved host with probeHost before returning so a
 * stale advertisement can't poison the cache.
 */
const discoverViaMDNS = (): Promise<string | null> => {
  return new Promise((resolveOuter) => {
    const zeroconf = new Zeroconf();
    const tried = new Set<string>();
    let settled = false;

    const finish = (url: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      zeroconf.removeAllListeners();
      try {
        zeroconf.stop();
      } catch {
        // ignore
      }
      resolveOuter(url);
    };

    const timer = setTimeout(() => finish(null), MDNS_TIMEOUT_MS);

    const tryService = async (service: ZeroconfService) => {
      const key = service.fullName || service.name;
      if (tried.has(key)) return;
      tried.add(key);

      const port = service.port ?? CONFIG_SERVICE_PORTS[0];
      const candidates =
        service.addresses?.length ? service.addresses : service.host ? [service.host] : [];

      for (const addr of candidates) {
        const verified = await probeHost(addr, port);
        if (verified) {
          finish(verified);
          return;
        }
      }
    };

    zeroconf.on('resolved', (service: ZeroconfService) => {
      void tryService(service);
    });
    zeroconf.on('error', () => {
      // timeout path handles end-of-scan
    });

    try {
      zeroconf.scan(MDNS_SERVICE_TYPE, MDNS_SERVICE_PROTOCOL, 'local.');
    } catch {
      finish(null);
    }
  });
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
 *
 * Strategy: fully parallel batched sweep of all 1-254 hosts on each known
 * config-service port. Each probe is bounded by PROBE_TIMEOUT_MS. With
 * BATCH_SIZE=50 and PROBE_TIMEOUT_MS=1500, a full /24 sweep completes in
 * ~6 batches × 1.5s ≈ 9s worst case.
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
  const hosts: number[] = [];
  for (let i = 1; i < 255; i++) hosts.push(i);

  for (let batchStart = 0; batchStart < hosts.length; batchStart += BATCH_SIZE) {
    const batch = hosts.slice(batchStart, batchStart + BATCH_SIZE);
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
 * 0. Manual URL override
 * 1. Cached config URL
 * 2. mDNS / Bonjour browse for _jarvis-config._tcp (fast, runs on every launch)
 * 3. Scan local /24 (slow fallback, only when user explicitly opts in)
 * 4. Empty config + "no server found" message
 *
 * `skipNetworkScan` only gates the LAN sweep. mDNS is cheap enough (≤5s) and
 * provides instant discovery for users with the publisher set up, so it runs
 * even on cold launch.
 */
export const discoverConfigService = async (
  skipNetworkScan = false,
): Promise<DiscoveryResult> => {
  // Tier 0: Manual URL override — authoritative. If the user has pinned a
  // server URL we resolve ONLY against it and never fall through to
  // auto-discovery. Falling through (the old behavior) could silently connect
  // to a different LAN server when the pinned URL was briefly unreachable,
  // while the UI kept showing the pinned URL — a confusing mismatch between
  // the displayed and the actual server.
  // A user's UI-pinned URL is authoritative. In DEV_MODE only, if none is pinned
  // (e.g. a fresh clearState e2e build that can't mDNS/sweep a CI stack), fall
  // back to the baked config-service URL from the development-e2e EAS profile so
  // the app can still reach config-service to fetch a provisioning token.
  // Production builds never set EXPO_PUBLIC_MANUAL_CONFIG_URL, so this is inert.
  const manualUrl =
    (await loadManualConfigUrl()) ||
    (DEV_MODE && MANUAL_CONFIG_URL ? MANUAL_CONFIG_URL : null);
  if (manualUrl) {
    const config = await fetchServiceUrls(manualUrl);
    if (config) {
      setServiceConfig(config);
      return { config, isCloud: false, fallbackMessage: null };
    }
    // Pinned but unreachable: report the error against the pinned URL itself
    // instead of auto-discovering a different server behind the same label.
    const unreachableConfig: ServiceConfig = {
      authBaseUrl: '',
      commandCenterUrl: '',
      configServiceUrl: manualUrl,
      notificationsUrl: '',
      pantryUrl: '',
    };
    setServiceConfig(unreachableConfig);
    return {
      config: unreachableConfig,
      isCloud: false,
      fallbackMessage: `Can't reach the server at ${manualUrl}. Check the URL or your connection, or clear it to search your local network.`,
    };
  }

  // Tier 1: Try cached config
  const cached = await loadCachedConfig();
  if (cached?.configServiceUrl) {
    const validated = await fetchServiceUrls(cached.configServiceUrl);
    if (validated) {
      setServiceConfig(validated);
      return { config: validated, isCloud: false, fallbackMessage: null };
    }
    // Config service unreachable (e.g., on node WiFi) but we have cached URLs —
    // use them so provisioning flow can access the command center URL later
    if (cached.authBaseUrl && cached.commandCenterUrl) {
      setServiceConfig(cached);
      return {
        config: cached,
        isCloud: false,
        fallbackMessage: 'Using cached service URLs (config service unreachable).',
      };
    }
  }

  // Tier 2: mDNS browse (fast, always runs)
  const mdnsUrl = await discoverViaMDNS();
  if (mdnsUrl) {
    const config = await fetchServiceUrls(mdnsUrl);
    if (config) {
      setServiceConfig(config);
      await cacheConfig(config);
      return { config, isCloud: false, fallbackMessage: null };
    }
  }

  // Tier 3: Scan local network (with timeout)
  if (!skipNetworkScan) {
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
  }

  // No cloud fallback — Jarvis is a privacy-first, self-hosted product.
  // Users must explicitly configure a server URL or discover one locally.
  const emptyConfig: ServiceConfig = {
    authBaseUrl: '',
    commandCenterUrl: '',
    configServiceUrl: null,
    notificationsUrl: '',
    pantryUrl: '',
  };
  setServiceConfig(emptyConfig);
  return {
    config: emptyConfig,
    isCloud: false,
    fallbackMessage:
      'No Jarvis server found. Tap "Find Local Server" to scan your network, or enter your server URL manually.',
  };
};
