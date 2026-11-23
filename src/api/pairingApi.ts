import axios from 'axios';

import { getCommandCenterUrl } from '../config/serviceConfig';
import apiClient from './apiClient';

/**
 * Device-code pairing, the member's side (jarvis-server internal/modules/cc/pairing.go).
 * The Jarvis Automation agent on a computer starts a pairing and shows a short code. The
 * server never lists the codes, so only someone who can see that computer can approve it: the
 * member types the code here, into one of their own households and a room, or denies it.
 */

export interface PairingHousehold {
  id: string;
  name: string;
  role: string;
}

export interface PairingList {
  /** How many computers are waiting for approval (any household; the codes stay hidden). */
  waiting: number;
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
    waiting: typeof res.data?.waiting === 'number' ? res.data.waiting : 0,
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
