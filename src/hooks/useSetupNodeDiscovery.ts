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
 * Browse `_jarvis-setup._tcp` while the caller is mounted and return the
 * LAN nodes currently waiting to be set up, deduped by node id.
 */
export const useSetupNodeDiscovery = (): DiscoveredSetupNode[] => {
  const [nodes, setNodes] = useState<DiscoveredSetupNode[]>([]);

  useEffect(() => {
    // Keyed by instance name: the 'remove' event only carries the name.
    const byName = new Map<string, DiscoveredSetupNode>();

    const publish = () => {
      const byId = new Map<string, DiscoveredSetupNode>();
      for (const node of byName.values()) byId.set(node.nodeId, node);
      setNodes([...byId.values()]);
    };

    let zeroconf: Zeroconf;
    try {
      // Required lazily: the native module is absent in Expo Go and jest.
      const ZeroconfClass = require('react-native-zeroconf').default;
      zeroconf = new ZeroconfClass();
    } catch {
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

    zeroconf.on('error', () => {
      // A failed browse just means no LAN discovery; the hotspot path remains.
    });

    try {
      zeroconf.scan(SETUP_SERVICE_TYPE, SETUP_SERVICE_PROTOCOL, 'local.');
    } catch {
      // Native module unavailable (Expo Go): leave the list empty.
    }

    return () => {
      zeroconf.removeAllListeners();
      try {
        zeroconf.stop();
      } catch {
        // ignore
      }
    };
  }, []);

  return nodes;
};
