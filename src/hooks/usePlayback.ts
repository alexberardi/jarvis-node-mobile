import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { controlPlayback, getPlayback, NodePlayback, PlaybackControl } from '../api/playbackApi';
import { useAuth } from '../auth/AuthContext';

// Polled at the root (P11): fast while something plays, slow otherwise, not at all in the
// background. Every component reading it shares the one query.
export const PLAYING_POLL_MS = 2000;
export const IDLE_POLL_MS = 15000;

const playbackKey = (hh: string | null) => ['playback', hh] as const;

export const usePlayback = () => {
  const { state } = useAuth();
  const hh = state.activeHouseholdId;
  const [active, setActive] = useState(AppState.currentState !== 'background');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s !== 'background'));
    return () => sub.remove();
  }, []);
  return useQuery({
    queryKey: playbackKey(hh),
    queryFn: () => getPlayback(hh as string),
    enabled: !!hh && active,
    refetchInterval: (q) => ((q.state.data?.length ?? 0) > 0 ? PLAYING_POLL_MS : IDLE_POLL_MS),
    retry: false,
  });
};

/** One control; the answer (the node's read-back) replaces that node's entry at once. */
export const usePlaybackControl = () => {
  const qc = useQueryClient();
  const { state } = useAuth();
  const key = playbackKey(state.activeHouseholdId);
  return useMutation({
    mutationFn: (c: PlaybackControl) => controlPlayback(c),
    onSuccess: (now, c) => {
      qc.setQueryData<NodePlayback[]>(key, (old = []) => {
        if (!now) return old.filter((p) => p.node_id !== c.node_id);
        const i = old.findIndex((p) => p.node_id === c.node_id);
        return i < 0 ? [...old, now] : old.map((p, j) => (j === i ? now : p));
      });
    },
  });
};
