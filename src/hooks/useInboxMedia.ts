import { useCallback, useEffect, useState } from 'react';

import { downloadInboxMedia } from '../services/inboxMediaService';

export type InboxMediaStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Download an inbox media URL through the authenticated cache and track it:
 * idle (no URL) → loading → ready (local file URI) | error (with retry).
 */
export const useInboxMedia = (url: string | undefined, mimeType?: string) => {
  const [status, setStatus] = useState<InboxMediaStatus>(url ? 'loading' : 'idle');
  const [uri, setUri] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!url) {
      setStatus('idle');
      setUri(null);
      return undefined;
    }
    let cancelled = false;
    setStatus('loading');
    downloadInboxMedia(url, mimeType)
      .then((local) => {
        if (cancelled) return;
        setUri(local);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [url, mimeType, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { status, uri, retry };
};
