/**
 * What the chat endpoint accepts beyond text (currently: images).
 *
 * Re-read whenever the chat screen gains focus; the last-known value for the
 * current server is served from a per-server cache in the meantime.
 */

import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  ChatCapabilities,
  fetchChatCapabilities,
  getCachedChatCapabilities,
  NO_CHAT_CAPABILITIES,
} from '../api/chatApi';

interface UseChatCapabilitiesReturn {
  capabilities: ChatCapabilities;
  /** Force a fresh read (e.g. after the server rejected images). */
  refresh: () => Promise<ChatCapabilities>;
  /** Hide images immediately, before a refresh lands. */
  disableImages: () => void;
}

export function useChatCapabilities(enabled: boolean): UseChatCapabilitiesReturn {
  const [capabilities, setCapabilities] = useState<ChatCapabilities>(
    () => getCachedChatCapabilities() ?? NO_CHAT_CAPABILITIES,
  );
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const caps = await fetchChatCapabilities();
    if (mountedRef.current) setCapabilities(caps);
    return caps;
  }, []);

  const disableImages = useCallback(() => {
    setCapabilities((prev) => ({ ...prev, images: false }));
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      refresh().catch(() => {});
    }, [enabled, refresh]),
  );

  return { capabilities, refresh, disableImages };
}
