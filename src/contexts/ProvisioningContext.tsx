import React, { createContext, useContext, ReactNode } from 'react';

import { useProvisioning } from '../hooks/useProvisioning';
import {
  NodeInfo,
  Network,
  ProvisioningState,
  ProvisioningResult,
} from '../types/Provisioning';
import { K2KeyPair } from '../services/k2Service';

interface ProvisioningContextValue {
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
  confirmWifiSwitched: () => void;
  reset: () => void;
  setError: (error: string | null) => void;
}

const ProvisioningContext = createContext<ProvisioningContextValue | undefined>(undefined);

export const ProvisioningProvider = ({ children }: { children: ReactNode }) => {
  const provisioning = useProvisioning();

  return (
    <ProvisioningContext.Provider value={provisioning}>
      {children}
    </ProvisioningContext.Provider>
  );
};

export const useProvisioningContext = (): ProvisioningContextValue => {
  const context = useContext(ProvisioningContext);
  if (!context) {
    throw new Error('useProvisioningContext must be used within a ProvisioningProvider');
  }
  return context;
};
