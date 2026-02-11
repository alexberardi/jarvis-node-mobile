import { useCallback, useState } from 'react';

import {
  requestProvisioningToken,
  ProvisioningTokenRequest,
} from '../api/commandCenterApi';
import {
  USE_MOCK,
  mockRequestProvisioningToken,
} from '../api/mockProvisioningApi';
import {
  getNodeInfo,
  scanNetworks,
  provision,
  provisionK2,
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
  provisioningToken: string | null;
  ccNodeId: string | null;

  // Actions
  connect: (ip: string, port?: number) => Promise<boolean>;
  fetchNetworks: () => Promise<boolean>;
  selectNetwork: (network: Network) => void;
  startProvisioning: (password: string, roomName: string, householdId: string) => Promise<void>;
  confirmWifiSwitched: () => void;
  reset: () => void;
  setError: (error: string | null) => void;
  fetchProvisioningToken: (householdId: string, accessToken: string, room?: string) => Promise<boolean>;
  refreshProvisioningToken: (householdId: string, accessToken: string) => Promise<boolean>;
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
  const [provisioningToken, setProvisioningToken] = useState<string | null>(null);
  const [ccNodeId, setCcNodeId] = useState<string | null>(null);
  const [tokenExpiresAt, setTokenExpiresAt] = useState<string | null>(null);

  const connect = useCallback(async (ip: string, port: number = 8080): Promise<boolean> => {
    try {
      setIsLoading(true);
      setError(null);
      setState('connecting');
      setNodeIp(ip, port);

      const info = await getNodeInfo();
      setNodeInfo(info);
      setState('fetching_info');
      return true;
    } catch (err) {
      console.debug('[useProvisioning] connect failed:', err instanceof Error ? err.message : err);
      const message = err instanceof Error ? err.message : 'Failed to connect to node';
      setError(message);
      setState('error');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchNetworks = useCallback(async (): Promise<boolean> => {
    try {
      setIsLoading(true);
      setError(null);
      setNetworks([]); // Clear old networks before scanning

      const networkList = await scanNetworks();
      setNetworks(networkList);
      setState('scanning_networks');
      return true;
    } catch (err) {
      console.debug('[useProvisioning] fetchNetworks failed:', err instanceof Error ? err.message : err);
      const message = err instanceof Error ? err.message : 'Failed to scan networks';
      setError(message);
      setState('error');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const selectNetwork = useCallback((network: Network) => {
    setSelectedNetwork(network);
    setState('configuring');
  }, []);

  const fetchProvisioningToken = useCallback(
    async (householdId: string, accessToken: string, room?: string): Promise<boolean> => {
      try {
        setError(null);

        let response;
        if (USE_MOCK) {
          response = await mockRequestProvisioningToken();
        } else {
          const request: ProvisioningTokenRequest = {
            household_id: householdId,
            ...(room && { room }),
          };
          response = await requestProvisioningToken(request, accessToken);
        }

        setProvisioningToken(response.token);
        setCcNodeId(response.node_id);
        setTokenExpiresAt(response.expires_at);
        return true;
      } catch (err) {
        console.debug('[useProvisioning] fetchProvisioningToken failed:', err instanceof Error ? err.message : err);
        const message = err instanceof Error ? err.message : 'Failed to get provisioning token';
        setError(message);
        return false;
      }
    },
    []
  );

  const refreshProvisioningToken = useCallback(
    async (householdId: string, accessToken: string): Promise<boolean> => {
      try {
        setError(null);

        if (!ccNodeId) {
          setError('No node ID to refresh token for');
          return false;
        }

        let response;
        if (USE_MOCK) {
          response = await mockRequestProvisioningToken();
        } else {
          const request: ProvisioningTokenRequest = {
            household_id: householdId,
            node_id: ccNodeId,
          };
          response = await requestProvisioningToken(request, accessToken);
        }

        setProvisioningToken(response.token);
        setTokenExpiresAt(response.expires_at);
        return true;
      } catch (err) {
        console.debug('[useProvisioning] refreshProvisioningToken failed:', err instanceof Error ? err.message : err);
        const message = err instanceof Error ? err.message : 'Failed to refresh provisioning token';
        setError(message);
        return false;
      }
    },
    [ccNodeId]
  );

  const startProvisioning = useCallback(
    async (password: string, roomName: string, householdId: string) => {
      if (!selectedNetwork) {
        setError('No network selected');
        return;
      }

      if (!nodeInfo?.node_id) {
        setError('Node info not available');
        return;
      }

      if (!householdId) {
        setError('No household selected');
        return;
      }

      if (!provisioningToken || !ccNodeId) {
        setError('Provisioning token not available. Go back and try again.');
        return;
      }

      // Check if token has expired
      if (tokenExpiresAt && new Date(tokenExpiresAt) <= new Date()) {
        setError('Provisioning token has expired. Go back and try again.');
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        setState('provisioning');
        setProgress(0);
        setStatusMessage('Generating encryption key...');

        // Step 1: Generate K2 key using CC-assigned node ID
        const keyPair = await generateK2(ccNodeId);
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
          throw new Error(k2Response.error || 'Failed to provision K2 to node');
        }

        // Step 3: Store K2 locally BEFORE sending WiFi credentials
        // The node already has K2, and it will drop AP mode after receiving WiFi creds
        // We must store K2 now or we'll lose it if the network changes
        await storeK2(keyPair);
        setProgress(25);
        setStatusMessage('Configuring WiFi credentials...');

        // Step 4: Send WiFi credentials with provisioning token
        // Note: The node may drop AP immediately after receiving this, causing the
        // request to timeout. This is expected - we consider it successful if we
        // got this far since the node will have received the credentials.
        let provisionSuccess = false;
        try {
          const result = await provision({
            ssid: selectedNetwork.ssid,
            password,
            room_name: roomName,
            household_id: householdId,
            node_id: ccNodeId,
            provisioning_token: provisioningToken,
          });
          provisionSuccess = result.success;
        } catch (provisionErr) {
          // Network error is expected - node drops AP after receiving credentials
          console.debug(
            '[useProvisioning] provision() failed (expected if node dropped AP):',
            provisionErr instanceof Error ? provisionErr.message : provisionErr
          );
          // Consider it successful since the node received the request
          provisionSuccess = true;
        }

        // Update result with CC-assigned node ID
        const fullResult = {
          success: provisionSuccess,
          node_id: ccNodeId,
          room_name: roomName,
          message: 'Credentials sent to node',
        };

        setProgress(50);
        setStatusMessage('Credentials sent to node...');
        setProvisioningResult(fullResult);

        setProgress(75);
        setStatusMessage('Please reconnect to your home WiFi');

        // Step 5: Tell user to switch back to home WiFi
        // The node is now attempting to connect and will drop AP mode
        setState('awaiting_wifi_switch');
      } catch (err) {
        console.debug('[useProvisioning] startProvisioning failed:', err instanceof Error ? err.message : err);
        const message = err instanceof Error ? err.message : 'Provisioning failed';
        setError(message);
        setState('error');
      } finally {
        setIsLoading(false);
      }
    },
    [selectedNetwork, nodeInfo, provisioningToken, ccNodeId, tokenExpiresAt]
  );

  const confirmWifiSwitched = useCallback(() => {
    // User confirmed they've reconnected to home WiFi
    // Mark provisioning as complete
    setProgress(100);
    setStatusMessage('Provisioning complete!');
    setState('success');
  }, []);

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
    setProvisioningToken(null);
    setCcNodeId(null);
    setTokenExpiresAt(null);
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
    provisioningToken,
    ccNodeId,
    connect,
    fetchNetworks,
    selectNetwork,
    startProvisioning,
    confirmWifiSwitched,
    reset,
    setError,
    fetchProvisioningToken,
    refreshProvisioningToken,
  };
};
