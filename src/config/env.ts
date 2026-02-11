export const DEV_MODE = process.env.EXPO_PUBLIC_DEV_MODE === 'true';

export const SIMULATED_NODE_IP =
  process.env.EXPO_PUBLIC_SIMULATED_NODE_IP ?? '192.168.4.1';

export const NODE_PORT = parseInt(
  process.env.EXPO_PUBLIC_NODE_PORT ?? '8080',
  10
);
