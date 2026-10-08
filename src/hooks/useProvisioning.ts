import { useCallback, useEffect, useRef, useState } from 'react';

import {
  requestProvisioningToken,
  ProvisioningTokenRequest,
  ProvisioningTokenResponse,
} from '../api/commandCenterApi';
import {
  USE_MOCK,
  mockRequestProvisioningToken,
} from '../api/mockProvisioningApi';
import {
  getNodeInfo,
  getNodeRegistrationStatus,
  scanNetworks,
  provision,
  provisionK2,
  setNodeIp,
} from '../api/provisioningApi';
import { getSmartHomeConfig } from '../api/smartHomeApi';
import { getCommandCenterUrl } from '../config/serviceConfig';
import {
  NodeInfo,
  Network,
  NodeRegistrationStatus,
  ProvisioningState,
  ProvisioningResult,
} from '../types/Provisioning';
import { generateK2, storeK2, K2KeyPair } from '../services/k2Service';

/**
 * A provisioning token must still have at least this long to live when it is
 * handed to the node: the node has to join WiFi (and, after a power-cycle,
 * boot) before it redeems it. Tokens live 10 min on the legacy command center
 * and 30 min on jarvisd.
 */
export const TOKEN_REGISTRATION_BUDGET_MS = 5 * 60 * 1000;
/** How long to wait on the command center when re-requesting a token mid-flow. */
export const TOKEN_REFRESH_TIMEOUT_MS = 5000;
/** Fallback lifetime when the server response carries no usable expiry. */
const DEFAULT_TOKEN_TTL_MS = 10 * 60 * 1000;

/** After the user is back on home WiFi, how long to wait for the node to register. */
export const VERIFY_TIMEOUT_MS = 3 * 60 * 1000;
export const VERIFY_POLL_MS = 4000;
/** Per-probe timeout for the node's status endpoint (only reachable over its hotspot). */
const NODE_STATUS_TIMEOUT_MS = 3000;

export const REGISTRATION_FAILED_MESSAGE =
  "The node couldn't register — reconnect to its setup hotspot and try again.";
export const TOKEN_EXPIRED_MESSAGE =
  'The setup code from "Prepare" has expired. Reconnect to your home WiFi, tap Prepare again, ' +
  "then rejoin the node's Jarvis-XXXX hotspot.";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Parse a server timestamp. The command center emits naive UTC ISO strings
 * (no `Z`), which `new Date()` would read as *local* time — pushing the expiry
 * hours into the future in US time zones, so a stale token looked valid.
 */
export const parseServerTimestamp = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(value.trim());
  const ms = Date.parse(hasZone ? value : `${value.trim()}Z`);
  return Number.isNaN(ms) ? null : ms;
};

interface TokenInfo {
  token: string;
  nodeId: string;
  fetchedAt: number;
  expiresAt: number;
}

/**
 * When a just-received token expires, by the phone's clock. `expires_in` is
 * measured from receipt (immune to clock skew and timestamp-format bugs);
 * `expires_at` is a cross-check. The earlier of the two wins.
 */
export const tokenExpiresAt = (
  response: Pick<ProvisioningTokenResponse, 'expires_at' | 'expires_in'>,
  fetchedAt: number,
): number => {
  const candidates: number[] = [];
  if (typeof response.expires_in === 'number' && response.expires_in > 0) {
    candidates.push(fetchedAt + response.expires_in * 1000);
  }
  const absolute = parseServerTimestamp(response.expires_at);
  if (absolute !== null) candidates.push(absolute);
  return candidates.length ? Math.min(...candidates) : fetchedAt + DEFAULT_TOKEN_TTL_MS;
};

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
  /** Failure reason reported by the node itself (over its hotspot), if any. */
  failureReason: string | null;

  // Actions
  connect: (ip: string, port?: number) => Promise<boolean>;
  fetchNetworks: () => Promise<boolean>;
  selectNetwork: (network: Network) => void;
  startProvisioning: (password: string, roomName: string, householdId: string) => Promise<void>;
  confirmWifiSwitched: () => void;
  /** Re-run the wait-for-registration poll (e.g. "Keep waiting"). */
  retryVerification: () => void;
  /** Probe the node's status endpoint over its hotspot and surface any failure reason. */
  checkNodeStatus: () => Promise<NodeRegistrationStatus | null>;
  reset: () => void;
  setError: (error: string | null) => void;
  fetchProvisioningToken: (householdId: string, room?: string) => Promise<boolean>;
  refreshProvisioningToken: (householdId: string) => Promise<boolean>;
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
  const [failureReason, setFailureReason] = useState<string | null>(null);
  // The live token + its phone-clock expiry. A ref (not state) so the
  // provisioning step always reads the newest token, including one minted a
  // moment earlier inside the same call.
  const tokenRef = useRef<TokenInfo | null>(null);
  // Capture command center URL at token fetch time (when on home WiFi)
  // so it's still available after switching to node WiFi
  const [cachedCommandCenterUrl, setCachedCommandCenterUrl] = useState<string | null>(null);
  // What the post-send verification polls for: this node in this household.
  const verifyTargetRef = useRef<{ householdId: string; nodeId: string } | null>(null);
  // Bumped to cancel an in-flight verification loop (reset, retry, unmount).
  const verifyGenRef = useRef(0);

  useEffect(
    () => () => {
      verifyGenRef.current += 1;
    },
    [],
  );

  const connect = useCallback(async (ip: string, port: number = 8080): Promise<boolean> => {
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 2000;

    try {
      setIsLoading(true);
      setError(null);
      setState('connecting');
      setNodeIp(ip, port);

      let lastError: unknown;
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const info = await getNodeInfo();
          setNodeInfo(info);
          setState('fetching_info');
          return true;
        } catch (err) {
          lastError = err;
          console.debug(
            `[useProvisioning] connect attempt ${attempt}/${MAX_RETRIES} failed:`,
            err instanceof Error ? err.message : err,
          );
          if (attempt < MAX_RETRIES) {
            // Wait before retrying — gives iOS time to route through WiFi
            await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          }
        }
      }

      const message = lastError instanceof Error ? lastError.message : 'Failed to connect to node';
      setError(`Could not reach node at ${ip}:${port}. Make sure you're on the node's WiFi (Jarvis-XXXX).`);
      console.debug('[useProvisioning] all retries exhausted:', message);
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

  const applyToken = useCallback((response: ProvisioningTokenResponse): TokenInfo => {
    const fetchedAt = Date.now();
    const info: TokenInfo = {
      token: response.token,
      nodeId: response.node_id,
      fetchedAt,
      expiresAt: tokenExpiresAt(response, fetchedAt),
    };
    tokenRef.current = info;
    setProvisioningToken(info.token);
    setCcNodeId(info.nodeId);
    return info;
  }, []);

  const fetchProvisioningToken = useCallback(
    async (householdId: string, room?: string): Promise<boolean> => {
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
          response = await requestProvisioningToken(request);
        }

        applyToken(response);
        // Capture the command center URL now (while on home WiFi)
        // so it's available later when we're on node WiFi
        const ccUrl = getCommandCenterUrl();
        setCachedCommandCenterUrl(ccUrl);
        console.debug('[useProvisioning] cached command center URL:', ccUrl);
        return true;
      } catch (err) {
        console.debug('[useProvisioning] fetchProvisioningToken failed:', err instanceof Error ? err.message : err);
        const message = err instanceof Error ? err.message : 'Failed to get provisioning token';
        setError(message);
        return false;
      }
    },
    [applyToken]
  );

  const refreshProvisioningToken = useCallback(
    async (householdId: string): Promise<boolean> => {
      try {
        setError(null);

        const nodeId = tokenRef.current?.nodeId ?? ccNodeId;
        if (!nodeId) {
          setError('No node ID to refresh token for');
          return false;
        }

        let response;
        if (USE_MOCK) {
          response = await mockRequestProvisioningToken();
        } else {
          const request: ProvisioningTokenRequest = {
            household_id: householdId,
            node_id: nodeId,
          };
          response = await requestProvisioningToken(request);
        }

        applyToken({ ...response, node_id: nodeId });
        return true;
      } catch (err) {
        console.debug('[useProvisioning] refreshProvisioningToken failed:', err instanceof Error ? err.message : err);
        const message = err instanceof Error ? err.message : 'Failed to refresh provisioning token';
        setError(message);
        return false;
      }
    },
    [ccNodeId, applyToken]
  );

  /**
   * Get the token to hand the node *right now*.
   *
   * Always try to mint a fresh one first (same node_id, which also invalidates
   * the old one server-side) — that succeeds whenever the phone can still reach
   * the command center. On the node's hotspot it usually can't, so fall back to
   * the token from "Prepare", but only if it will outlive the node's
   * WiFi-join + registration. A token too stale for that is refused here, before
   * anything is sent to the node, instead of letting the node 401 later.
   */
  const acquireFreshToken = useCallback(
    async (householdId: string): Promise<TokenInfo> => {
      const cached = tokenRef.current;
      if (!cached) {
        throw new Error('Provisioning token not available. Go back and try again.');
      }

      if (!USE_MOCK) {
        try {
          const response = await requestProvisioningToken(
            { household_id: householdId, node_id: cached.nodeId },
            { timeoutMs: TOKEN_REFRESH_TIMEOUT_MS },
          );
          // Keep the node_id we already generated K2 for; the server echoes it.
          const fresh = applyToken({ ...response, node_id: cached.nodeId });
          if (fresh.expiresAt > Date.now()) {
            console.debug('[useProvisioning] minted a fresh provisioning token before sending');
            return fresh;
          }
        } catch (err) {
          console.debug(
            '[useProvisioning] could not refresh token (expected on the node hotspot):',
            err instanceof Error ? err.message : err,
          );
        }
      }

      const current = tokenRef.current ?? cached;
      if (current.expiresAt - Date.now() >= TOKEN_REGISTRATION_BUDGET_MS) {
        return current;
      }
      throw new Error(TOKEN_EXPIRED_MESSAGE);
    },
    [applyToken],
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

      if (!tokenRef.current) {
        setError('Provisioning token not available. Go back and try again.');
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        setFailureReason(null);
        setState('provisioning');
        setProgress(0);
        setStatusMessage('Checking setup code...');

        // Step 0: Get the token to send. Done first so a stale token fails
        // before anything touches the node, and seconds (not minutes) before
        // the credentials go out.
        let token: TokenInfo;
        try {
          token = await acquireFreshToken(householdId);
        } catch (tokenErr) {
          const message = tokenErr instanceof Error ? tokenErr.message : TOKEN_EXPIRED_MESSAGE;
          setError(message);
          setState('error');
          return;
        }
        const nodeId = token.nodeId;

        setProgress(5);
        setStatusMessage('Generating encryption key...');

        // Step 1: Generate K2 key using CC-assigned node ID
        const keyPair = await generateK2(nodeId);
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
        // Use the command center URL we cached during Phase 1 (home WiFi),
        // since getCommandCenterUrl() may be empty now (we're on node WiFi)
        const commandCenterUrl = cachedCommandCenterUrl || getCommandCenterUrl();
        console.debug('[useProvisioning] command_center_url for node:', commandCenterUrl);
        if (!commandCenterUrl) {
          throw new Error('Command center URL not available. Go back to home WiFi and tap Prepare again.');
        }

        const send = (provisioningToken: string) =>
          provision({
            ssid: selectedNetwork.ssid,
            password,
            room_name: roomName,
            command_center_url: commandCenterUrl,
            household_id: householdId,
            node_id: nodeId,
            provisioning_token: provisioningToken,
          });

        // The node answers before it starts joining WiFi, but it may drop its AP
        // fast enough that the response never arrives. A *thrown* send is
        // therefore treated as delivered — and never retried with a new token:
        // minting one invalidates the token the node may already hold.
        // An explicit rejection means the node did not take the credentials,
        // so it is safe to get a new token and send once more.
        const isInProgress = (msg?: string) => !!msg && /in progress/i.test(msg);
        let attempt = 0;
        let currentToken = token.token;
        for (;;) {
          attempt += 1;
          let result: ProvisioningResult;
          try {
            result = await send(currentToken);
          } catch (provisionErr) {
            console.debug(
              '[useProvisioning] provision() failed (expected if node dropped AP):',
              provisionErr instanceof Error ? provisionErr.message : provisionErr
            );
            break;
          }
          if (result.success || isInProgress(result.message)) break;
          if (attempt >= 2) {
            throw new Error(result.message || 'The node rejected the WiFi credentials');
          }
          currentToken = (await acquireFreshToken(householdId)).token;
        }

        verifyTargetRef.current = { householdId, nodeId };
        setProvisioningResult({
          success: true,
          node_id: nodeId,
          room_name: roomName,
          message: 'Credentials sent to node',
        });

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
    [selectedNetwork, nodeInfo, cachedCommandCenterUrl, acquireFreshToken]
  );

  const failRegistration = useCallback((reason: string | null) => {
    setFailureReason(reason);
    setError(REGISTRATION_FAILED_MESSAGE);
    setStatusMessage('The node did not finish setting up');
    setState('registration_failed');
  }, []);

  /**
   * Back on home WiFi: wait for the node to show up in the household's node
   * list (it appears the moment /nodes/register succeeds). Meanwhile, probe the
   * node's own status endpoint — reachable only if the phone is (still/again)
   * on its hotspot — so a failure it reports is shown immediately. Gives up
   * after VERIFY_TIMEOUT_MS instead of spinning forever.
   */
  const runVerification = useCallback(async () => {
    const gen = ++verifyGenRef.current;
    const target = verifyTargetRef.current;

    setError(null);
    setFailureReason(null);
    setProgress(85);
    setStatusMessage('Waiting for your node to join WiFi and register...');
    setState('verifying');

    if (USE_MOCK || !target) {
      setProgress(100);
      setStatusMessage('Provisioning complete!');
      setState('success');
      return;
    }

    const isRegistered = async (): Promise<boolean> => {
      try {
        const config = await getSmartHomeConfig(target.householdId);
        return (config.nodes ?? []).some((n) => n.node_id === target.nodeId);
      } catch {
        return false; // phone may still be rejoining home WiFi
      }
    };
    const probeNode = async (): Promise<NodeRegistrationStatus | null> => {
      try {
        return await getNodeRegistrationStatus(NODE_STATUS_TIMEOUT_MS);
      } catch {
        return null; // not on the hotspot — expected
      }
    };

    const deadline = Date.now() + VERIFY_TIMEOUT_MS;
    for (;;) {
      const [registered, nodeStatus] = await Promise.all([isRegistered(), probeNode()]);
      if (gen !== verifyGenRef.current) return;

      if (registered) {
        setProgress(100);
        setStatusMessage('Provisioning complete!');
        setState('success');
        return;
      }
      if (nodeStatus?.registrationFailed) {
        failRegistration(nodeStatus.failureReason);
        return;
      }
      if (Date.now() >= deadline) {
        failRegistration(null);
        return;
      }
      await sleep(VERIFY_POLL_MS);
      if (gen !== verifyGenRef.current) return;
    }
  }, [failRegistration]);

  const confirmWifiSwitched = useCallback(() => {
    // User says they're back on home WiFi — success only once the node registers.
    void runVerification();
  }, [runVerification]);

  const retryVerification = useCallback(() => {
    void runVerification();
  }, [runVerification]);

  const checkNodeStatus = useCallback(async (): Promise<NodeRegistrationStatus | null> => {
    try {
      const status = await getNodeRegistrationStatus(NODE_STATUS_TIMEOUT_MS * 2);
      if (status.registrationFailed) {
        setFailureReason(status.failureReason);
      } else if (status.nodeState === 'PROVISIONED') {
        void runVerification();
      } else {
        setFailureReason(null);
        setStatusMessage(
          status.message
            ? `Node status: ${status.message}`
            : `Node status: ${status.nodeState}`,
        );
      }
      return status;
    } catch {
      setStatusMessage(
        "Couldn't reach the node. Connect to its Jarvis-XXXX hotspot, then check again.",
      );
      return null;
    }
  }, [runVerification]);

  const reset = useCallback(() => {
    verifyGenRef.current += 1;
    verifyTargetRef.current = null;
    tokenRef.current = null;
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
    setFailureReason(null);
    setCachedCommandCenterUrl(null);
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
    failureReason,
    connect,
    fetchNetworks,
    selectNetwork,
    startProvisioning,
    confirmWifiSwitched,
    retryVerification,
    checkNodeStatus,
    reset,
    setError,
    fetchProvisioningToken,
    refreshProvisioningToken,
  };
};
