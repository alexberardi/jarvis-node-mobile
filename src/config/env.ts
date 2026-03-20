export const DEV_MODE = process.env.EXPO_PUBLIC_DEV_MODE === 'true';

export const SIMULATED_NODE_IP =
  process.env.EXPO_PUBLIC_SIMULATED_NODE_IP ?? '192.168.4.1';

export const NODE_PORT = parseInt(
  process.env.EXPO_PUBLIC_NODE_PORT ?? '8080',
  10
);

/** Pantry store URL — set via EAS env or EXPO_PUBLIC_PANTRY_URL.
 *  Falls back to config-service discovery if not set. */
export const PANTRY_URL = process.env.EXPO_PUBLIC_PANTRY_URL ?? '';
