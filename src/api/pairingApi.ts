import axios from 'axios';

import { getCommandCenterUrl } from '../config/serviceConfig';
import apiClient from './apiClient';

/**
 * Device-code pairing, the member's side (jarvis-server internal/modules/cc/pairing.go,
 * install plan item 3.4). The Jarvis Automation agent on a computer starts a pairing and
 * shows a short code; any household member sees the same code here and approves it into one
 * of their own households and a room, or denies it. cc refuses a household the approver isn't
 * in, so the household picker only offers the ones this response lists.
 */

export interface PendingPairing {
  /** Display form, e.g. "ABCD-EFGH". The agent shows the same code. */
  code: string;
  /** The computer's name as the agent reported it. */
  name: string;
  platform?: string | null;
  requested_from?: string | null;
  created_at?: string | null;
  /** Seconds left before the pairing expires (10 minutes from the start). */
  expires_in: number;
}

export interface PairingHousehold {
  id: string;
  name: string;
  role: string;
}

export interface PairingList {
  pairings: PendingPairing[];
  /** The caller's own households: the only ones an approval may target. */
  households: PairingHousehold[];
}

/** The room a computer lands in unless the approver picks another (cc's pairingRoom). */
export const DEFAULT_PAIRING_ROOM = 'desktop';

/**
 * Where to get the agent. The server's verified per-OS download (`GET /api/addons/agent/{os}/{arch}`,
 * install plan 3.1) isn't built yet, so this is the public release page, the same link the
 * admin's Add-ons page uses.
 * TODO(install plan 3.1): switch to the server's download once it exists.
 */
export const AGENT_DOWNLOAD_URL = 'https://github.com/alexberardi/jarvis-server/releases';

const base = () => `${getCommandCenterUrl()}/api/v0/nodes/pairings`;

export const listPairings = async (): Promise<PairingList> => {
  const res = await apiClient.get<Partial<PairingList>>(base(), { timeout: 10000 });
  return {
    pairings: Array.isArray(res.data?.pairings) ? res.data.pairings : [],
    households: Array.isArray(res.data?.households) ? res.data.households : [],
  };
};

export interface ApproveResult {
  status: string;
  code?: string;
  household_id?: string;
  room?: string;
  name?: string;
}

export const approvePairing = async (args: {
  code: string;
  householdId: string;
  room: string;
}): Promise<ApproveResult> => {
  const res = await apiClient.post<ApproveResult>(`${base()}/approve`, {
    code: args.code,
    household_id: args.householdId,
    room: args.room.trim() || DEFAULT_PAIRING_ROOM,
  });
  return res.data;
};

export const denyPairing = async (code: string): Promise<void> => {
  await apiClient.post(`${base()}/deny`, { code });
};

/** The server's `{detail}` from a failed pairing call, else a plain-words fallback. */
export const pairingErrorMessage = (err: unknown, fallback: string): string => {
  if (axios.isAxiosError(err)) {
    const resp = err.response;
    const d = (resp?.data as { detail?: unknown } | undefined)?.detail;
    if (typeof d === 'string' && d.trim()) return d;
    if (resp?.status === 403) {
      return 'You can approve a computer only into a household you belong to.';
    }
  }
  return err instanceof Error && err.message ? err.message : fallback;
};
