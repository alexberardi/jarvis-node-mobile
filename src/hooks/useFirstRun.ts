import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

const KEY_PREFIX = 'firstRun:';

export interface UseFirstRunResult {
  visible: boolean;
  dismiss: () => Promise<void>;
  showAgain: () => void;
  loaded: boolean;
}

export function useFirstRun(storageKey: string): UseFirstRunResult {
  const fullKey = KEY_PREFIX + storageKey;
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(fullKey).then((seen) => {
      if (cancelled) return;
      setVisible(!seen);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [fullKey]);

  const dismiss = useCallback(async () => {
    setVisible(false);
    await AsyncStorage.setItem(fullKey, '1');
  }, [fullKey]);

  const showAgain = useCallback(() => {
    setVisible(true);
  }, []);

  return { visible, dismiss, showAgain, loaded };
}
