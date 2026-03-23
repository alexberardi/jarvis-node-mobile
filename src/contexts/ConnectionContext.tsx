/**
 * App-wide connection state provider.
 *
 * Periodically pings the command center health endpoint. When CC is unreachable,
 * sets status to 'offline' and shows a global banner. Auto-recovers when
 * connectivity returns, with exponential backoff during outages.
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { getCommandCenterUrl } from '../config/serviceConfig';

export type ConnectionStatus = 'connected' | 'checking' | 'offline';

interface ConnectionContextValue {
  /** Current connection status. */
  status: ConnectionStatus;
  /** How many consecutive health checks have failed. */
  failCount: number;
  /** Force an immediate health check. */
  checkNow: () => void;
}

const ConnectionContext = createContext<ConnectionContextValue>({
  status: 'checking',
  failCount: 0,
  checkNow: () => {},
});

export const useConnection = () => useContext(ConnectionContext);

const BASE_INTERVAL_MS = 30_000;    // 30s when healthy
const BACKOFF_INTERVAL_MS = 15_000; // 15s when offline (want faster recovery detection)
const HEALTH_TIMEOUT_MS = 5_000;    // 5s timeout for health check
const INITIAL_DELAY_MS = 3_000;     // Wait 3s before first check (let app settle)

export const ConnectionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<ConnectionStatus>('checking');
  const [failCount, setFailCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const checkHealth = useCallback(async () => {
    const ccUrl = getCommandCenterUrl();
    if (!ccUrl) {
      // No CC URL configured yet — don't mark as offline
      return;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

      const res = await fetch(`${ccUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!mountedRef.current) return;

      if (res.ok) {
        setStatus('connected');
        setFailCount(0);
      } else {
        setStatus('offline');
        setFailCount((prev) => prev + 1);
      }
    } catch {
      if (!mountedRef.current) return;
      setStatus('offline');
      setFailCount((prev) => prev + 1);
    }
  }, []);

  const scheduleNext = useCallback((currentFailCount: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const interval = currentFailCount > 0 ? BACKOFF_INTERVAL_MS : BASE_INTERVAL_MS;
    timerRef.current = setTimeout(() => {
      checkHealth();
    }, interval);
  }, [checkHealth]);

  // Schedule next check whenever failCount changes
  useEffect(() => {
    scheduleNext(failCount);
  }, [failCount, scheduleNext]);

  // Initial check after a short delay
  useEffect(() => {
    mountedRef.current = true;
    const initialTimer = setTimeout(() => {
      checkHealth();
    }, INITIAL_DELAY_MS);

    return () => {
      mountedRef.current = false;
      clearTimeout(initialTimer);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [checkHealth]);

  const checkNow = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    checkHealth();
  }, [checkHealth]);

  return (
    <ConnectionContext.Provider value={{ status, failCount, checkNow }}>
      {children}
    </ConnectionContext.Provider>
  );
};
