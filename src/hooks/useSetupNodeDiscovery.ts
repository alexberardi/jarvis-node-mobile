import { useEffect, useState } from 'react';
import type Zeroconf from 'react-native-zeroconf';
import type { Service } from 'react-native-zeroconf';

/**
 * A node in LAN setup mode, advertised over mDNS as `_jarvis-setup._tcp`
 * (jarvis-server docs/decisions/2026-10-22-pi-setup-mdns.md): instance name =
 * node id, port 8080, TXT records `node_id` and `hardware`.
 */
export interface DiscoveredSetupNode {
  nodeId: string;
  hardware?: string;
  address: string;
  port: number;
}

// react-native-zeroconf takes the service type without the leading underscore.
const SETUP_SERVICE_TYPE = 'jarvis-setup';
const SETUP_SERVICE_PROTOCOL = 'tcp';
const DEFAULT_SETUP_PORT = 8080;

const isIPv4 = (addr: string): boolean => /^\d{1,3}(\.\d{1,3}){3}$/.test(addr);

const pickAddress = (service: Service): string | null => {
  const addresses = service.addresses ?? [];
  return addresses.find(isIPv4) ?? addresses[0] ?? service.host ?? null;
};

/**
 * Where the LAN browse stands, so the screen never shows a blank:
 * - `searching`: the browse is running and has found nothing yet;
 * - `empty`: it has run for SEARCH_GRACE_MS (or stopped) with nothing found.
 *   The browse keeps running, so a node that shows up later is still listed;
 * - `unavailable`: no native module (Expo Go, jest) or the browse would not start;
 * - `error`: the browse reported an error, e.g. iOS refusing it because the
 *   user declined Local Network access.
 */
export type SetupDiscoveryStatus = 'searching' | 'empty' | 'unavailable' | 'error';

export interface SetupNodeDiscovery {
  nodes: DiscoveredSetupNode[];
  status: SetupDiscoveryStatus;
  /** The browse's error message, for `unavailable` and `error`. */
  error?: string;
}

/** How long a browse with no result counts as still searching. */
export const SEARCH_GRACE_MS = 8000;

const messageOf = (err: unknown): string =>
  err instanceof Error ? err.message : String(err ?? '');

/**
 * Browse `_jarvis-setup._tcp` while the caller is mounted and return the
 * LAN nodes currently waiting to be set up, deduped by node id, with the
 * browse's status.
 */
export const useSetupNodeDiscovery = (): SetupNodeDiscovery => {
  const [nodes, setNodes] = useState<DiscoveredSetupNode[]>([]);
  const [status, setStatus] = useState<SetupDiscoveryStatus>('searching');
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    // Keyed by instance name: the 'remove' event only carries the name.
    const byName = new Map<string, DiscoveredSetupNode>();

    const publish = () => {
      const byId = new Map<string, DiscoveredSetupNode>();
      for (const node of byName.values()) byId.set(node.nodeId, node);
      setNodes([...byId.values()]);
    };

    const fail = (next: 'unavailable' | 'error', err: unknown) => {
      setStatus(next);
      setError(messageOf(err) || undefined);
    };

    // Searching only counts as an answer once it has had time to find something.
    const settle = () =>
      setStatus((current) => (current === 'searching' ? 'empty' : current));

    let zeroconf: Zeroconf;
    try {
      // Required lazily: the native module is absent in Expo Go and jest.
      const ZeroconfClass = require('react-native-zeroconf').default;
      zeroconf = new ZeroconfClass();
    } catch (err) {
      fail('unavailable', err);
      return;
    }

    zeroconf.on('resolved', (service: Service) => {
      const address = pickAddress(service);
      const nodeId = service.txt?.node_id || service.name;
      if (!address || !nodeId) return;
      byName.set(service.name, {
        nodeId,
        hardware: service.txt?.hardware,
        address,
        port: service.port ?? DEFAULT_SETUP_PORT,
      });
      publish();
    });

    zeroconf.on('remove', (name: string) => {
      if (byName.delete(name)) publish();
    });

    zeroconf.on('stop', settle);

    zeroconf.on('error', (err: unknown) => fail('error', err));

    try {
      zeroconf.scan(SETUP_SERVICE_TYPE, SETUP_SERVICE_PROTOCOL, 'local.');
    } catch (err) {
      fail('unavailable', err);
      zeroconf.removeAllListeners();
      return;
    }

    const graceTimer = setTimeout(settle, SEARCH_GRACE_MS);

    return () => {
      clearTimeout(graceTimer);
      zeroconf.removeAllListeners();
      try {
        zeroconf.stop();
      } catch {
        // ignore
      }
    };
  }, []);

  return { nodes, status, error };
};
