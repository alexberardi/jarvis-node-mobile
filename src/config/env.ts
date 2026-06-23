export const DEV_MODE = process.env.EXPO_PUBLIC_DEV_MODE === 'true';

export const SIMULATED_NODE_IP =
  process.env.EXPO_PUBLIC_SIMULATED_NODE_IP ?? '192.168.4.1';

export const NODE_PORT = parseInt(
  process.env.EXPO_PUBLIC_NODE_PORT ?? '8080',
  10
);

/** DEV_MODE only: a baked config-service URL to seed config discovery when the
 *  app has no manually-pinned URL (e.g. a fresh clearState e2e build that can't
 *  mDNS/sweep a CI stack). Set by the `development-e2e` EAS profile. Inert unless
 *  DEV_MODE is also true; a user's UI-pinned URL always takes precedence. */
export const MANUAL_CONFIG_URL = process.env.EXPO_PUBLIC_MANUAL_CONFIG_URL ?? '';

/** Pantry store URL — set via EAS env or EXPO_PUBLIC_PANTRY_URL.
 *  Falls back to config-service discovery if not set. */
export const PANTRY_URL = process.env.EXPO_PUBLIC_PANTRY_URL ?? '';
