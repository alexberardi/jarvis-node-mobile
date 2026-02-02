import { useCallback, useState } from 'react';

import {
  getNodeInfo,
  scanNetworks,
  provision,
  provisionK2,
  getProvisioningStatus,
  setNodeIp,
} from '../api/provisioningApi';
import {
  NodeInfo,
  Network,
  ProvisioningState,
  ProvisioningResult,
} from '../types/Provisioning';
import { generateK2, storeK2, K2KeyPair } from '../services/k2Service';

interface UseProvisioningReturn {
  // State
  state: ProvisioningState;
  nodeInfo: NodeInfo | null;
  networks: Network[];
  selectedNetwork: Network | null;
  error: string | null;
  isLoading: boolean;
  progress: number;
  statusMessage: string;
  provisioningResult: ProvisioningResult | null;
  k2KeyPair: K2KeyPair | null;

  // Actions
  connect: (ip: string, port?: number) => Promise<void>;
  fetchNetworks: () => Promise<void>;
  selectNetwork: (network: Network) => void;
  startProvisioning: (password: string, roomName: string) => Promise<void>;
  reset: () => void;
  setError: (error: string | null) => void;
}

export const useProvisioning = (): UseProvisioningReturn => {
  const [state, setState] = useState<ProvisioningState>('idle');
  const [nodeInfo, setNodeInfo] = useState<NodeInfo | null>(null);
  const [networks, setNetworks] = useState<Network[]>([]);
  const [selectedNetwork, setSelectedNetwork] = useState<Network | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [provisioningResult, setProvisioningResult] = useState<ProvisioningResult | null>(null);
  const [k2KeyPair, setK2KeyPair] = useState<K2KeyPair | null>(null);

  const connect = useCallback(async (ip: string, port: number = 8080) => {
    try {
      setIsLoading(true);
      setError(null);
      setState('connecting');
      setNodeIp(ip, port);

      const info = await getNodeInfo();
      setNodeInfo(info);
      setState('fetching_info');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect to node';
      setError(message);
      setState('error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchNetworks = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const networkList = await scanNetworks();
      setNetworks(networkList);
      setState('scanning_networks');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to scan networks';
      setError(message);
      setState('error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const selectNetwork = useCallback((network: Network) => {
    setSelectedNetwork(network);
    setState('configuring');
  }, []);

  const startProvisioning = useCallback(
    async (password: string, roomName: string) => {
      if (!selectedNetwork) {
        setError('No network selected');
        return;
      }

      if (!nodeInfo?.node_id) {
        setError('Node info not available');
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        setState('provisioning');
        setProgress(0);
        setStatusMessage('Generating encryption key...');

        // Step 1: Generate K2 key
        const keyPair = await generateK2(nodeInfo.node_id);
        setK2KeyPair(keyPair);
        setProgress(10);
        setStatusMessage('Sending encryption key to node...');

        // Step 2: Send K2 to node (must happen while on node's AP)
        const k2Response = await provisionK2({
          nodeId: keyPair.nodeId,
          kid: keyPair.kid,
          k2: keyPair.k2,
          createdAt: keyPair.createdAt,
        });

        if (!k2Response.success) {
          throw new Error('Failed to provision K2 to node');
        }

        setProgress(25);
        setStatusMessage('Configuring WiFi credentials...');

        // Step 3: Send WiFi credentials
        const result = await provision({
          ssid: selectedNetwork.ssid,
          password,
          room_name: roomName,
        });

        // Update result with node_id from nodeInfo
        const fullResult = {
          ...result,
          node_id: nodeInfo.node_id,
        };

        // Step 4: Poll for status updates
        let attempts = 0;
        const maxAttempts = 30;

        while (attempts < maxAttempts) {
          const status = await getProvisioningStatus();
          // Adjust progress to account for K2 steps (25-100 range)
          const adjustedProgress = 25 + Math.floor(status.progress * 0.75);
          setProgress(adjustedProgress);
          setStatusMessage(status.message);

          if (status.state === 'success') {
            // Step 5: Store K2 in secure storage after successful provisioning
            await storeK2(keyPair);
            setProvisioningResult(fullResult);
            setState('success');
            break;
          }

          if (status.state === 'error') {
            setError(status.error || 'Provisioning failed');
            setState('error');
            break;
          }

          attempts++;
          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        if (attempts >= maxAttempts) {
          setError('Provisioning timeout');
          setState('error');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Provisioning failed';
        setError(message);
        setState('error');
      } finally {
        setIsLoading(false);
      }
    },
    [selectedNetwork, nodeInfo]
  );

  const reset = useCallback(() => {
    setState('idle');
    setNodeInfo(null);
    setNetworks([]);
    setSelectedNetwork(null);
    setError(null);
    setIsLoading(false);
    setProgress(0);
    setStatusMessage('');
    setProvisioningResult(null);
    setK2KeyPair(null);
  }, []);

  return {
    state,
    nodeInfo,
    networks,
    selectedNetwork,
    error,
    isLoading,
    progress,
    statusMessage,
    provisioningResult,
    k2KeyPair,
    connect,
    fetchNetworks,
    selectNetwork,
    startProvisioning,
    reset,
    setError,
  };
};
