import {
  ServiceConfig,
  loadCachedConfig,
  loadManualConfigUrl,
  saveManualConfigUrl,
  cacheConfig,
  setServiceConfig,
} from '../config/serviceConfig';
import { DEV_MODE, MANUAL_CONFIG_URL } from '../config/env';

const FETCH_SERVICES_TIMEOUT_MS = 3000;

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
      let svcUrl = svc.url.replace(/\/+$/, '');
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
 * The server URL the user pinned. Older versions found the server by network
 * discovery and only cached it; pin that cached URL once, so an existing install
 * keeps its server after the update instead of landing on a blank URL.
 */
export const loadPinnedUrl = async (): Promise<string | null> => {
  const manualUrl = await loadManualConfigUrl();
  if (manualUrl) return manualUrl;
  const cached = await loadCachedConfig();
  if (!cached?.configServiceUrl) return null;
  await saveManualConfigUrl(cached.configServiceUrl);
  return cached.configServiceUrl;
};

/**
 * Resolve the service URLs from the server URL the user entered. There is no
 * network discovery: with no URL set, the app asks the user for one.
 */
export const discoverConfigService = async (): Promise<DiscoveryResult> => {
  // A user's UI-pinned URL is authoritative: we resolve ONLY against it, so the
  // app never connects to a different server than the one it shows.
  // In DEV_MODE only, if none is pinned (e.g. a fresh clearState e2e build),
  // fall back to the baked config-service URL from the development-e2e EAS
  // profile so the app can still reach config-service to fetch a provisioning
  // token. Production builds never set EXPO_PUBLIC_MANUAL_CONFIG_URL, so this is inert.
  const manualUrl =
    (await loadPinnedUrl()) ||
    (DEV_MODE && MANUAL_CONFIG_URL ? MANUAL_CONFIG_URL : null);
  if (manualUrl) {
    const config = await fetchServiceUrls(manualUrl);
    if (config) {
      setServiceConfig(config);
      await cacheConfig(config);
      return { config, isCloud: false, fallbackMessage: null };
    }
    const unreachable = `Can't reach the server at ${manualUrl}. Check the URL or your connection.`;
    // Config service unreachable (e.g., on node WiFi) but we have cached URLs
    // for this same server: use them so the provisioning flow can still reach
    // the command center later.
    const cached = await loadCachedConfig();
    if (
      cached &&
      cached.configServiceUrl === manualUrl &&
      cached.authBaseUrl &&
      cached.commandCenterUrl
    ) {
      setServiceConfig(cached);
      return { config: cached, isCloud: false, fallbackMessage: unreachable };
    }
    // Report the error against the pinned URL itself.
    const unreachableConfig: ServiceConfig = {
      authBaseUrl: '',
      commandCenterUrl: '',
      configServiceUrl: manualUrl,
      notificationsUrl: '',
      pantryUrl: '',
    };
    setServiceConfig(unreachableConfig);
    return { config: unreachableConfig, isCloud: false, fallbackMessage: unreachable };
  }

  // No cloud fallback — Jarvis is a privacy-first, self-hosted product. The
  // landing screen asks for the server URL.
  const emptyConfig: ServiceConfig = {
    authBaseUrl: '',
    commandCenterUrl: '',
    configServiceUrl: null,
    notificationsUrl: '',
    pantryUrl: '',
  };
  setServiceConfig(emptyConfig);
  return { config: emptyConfig, isCloud: false, fallbackMessage: null };
};
