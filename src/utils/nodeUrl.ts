/**
 * URLs handed to a node during provisioning must be reachable *from the node*.
 *
 * A phone can reach the server through a loopback tunnel (USB debugging with
 * `adb reverse`), so the URLs it discovered are `http://localhost:7703` etc.
 * On the node, localhost is the node itself: it registers against itself, gets
 * "connection refused" and falls back to AP mode until it is re-provisioned
 * (found live 2026-10-09). Such a URL must never be sent.
 */

export const LOOPBACK_NODE_URL_MESSAGE =
  "This phone reaches the server through localhost (USB debugging), which the node can't use. " +
  'Set the server address to its LAN IP in Settings and try again.';

const hostOf = (url: string): string | null => {
  // Not `new URL()`: React Native's URL polyfill is incomplete. scheme://[userinfo@]host[:port][/...]
  const m = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/?#]*@)?(\[[^\]]*\]|[^:/?#]*)/i.exec(url.trim());
  if (!m) return null;
  return m[1].replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
};

/** True when a host names only the machine it is resolved on. */
export const isLoopbackHost = (host: string): boolean => {
  const h = host.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (h === '0.0.0.0' || h === '::' || h === '::1' || h === '0:0:0:0:0:0:0:1') return true;
  if (/^::ffff:127\./.test(h)) return true;
  return false;
};

/** True when the URL's host is loopback (and so useless to a node). */
export const isLoopbackUrl = (url: string): boolean => {
  const host = hostOf(url);
  return host !== null && isLoopbackHost(host);
};

/** Throws the user-facing error when a URL meant for the node is loopback. */
export const assertNodeReachableUrl = (url: string | null | undefined): void => {
  if (url && isLoopbackUrl(url)) {
    throw new Error(LOOPBACK_NODE_URL_MESSAGE);
  }
};
