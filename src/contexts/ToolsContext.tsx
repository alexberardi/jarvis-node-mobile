/**
 * Lightweight signal for when installed tools change.
 *
 * Pantry install/uninstall increments the version counter.
 * useChat watches it and re-warms only when the version changes,
 * instead of re-warming on every tab navigation.
 */

import React, { createContext, useCallback, useContext, useState } from 'react';

interface ToolsContextValue {
  /** Monotonically increasing counter — bumped when tools change. */
  toolsVersion: number;
  /** Call after installing or removing a Pantry package. */
  invalidateTools: () => void;
}

const ToolsContext = createContext<ToolsContextValue>({
  toolsVersion: 0,
  invalidateTools: () => {},
});

export const useToolsVersion = () => useContext(ToolsContext);

export function ToolsProvider({ children }: { children: React.ReactNode }) {
  const [toolsVersion, setToolsVersion] = useState(0);

  const invalidateTools = useCallback(() => {
    setToolsVersion((v) => v + 1);
  }, []);

  return (
    <ToolsContext.Provider value={{ toolsVersion, invalidateTools }}>
      {children}
    </ToolsContext.Provider>
  );
}
