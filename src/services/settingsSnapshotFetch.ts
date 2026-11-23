import { pollSettingsResult, requestSettingsSnapshot } from '../api/nodeSettingsApi';
import { decryptSettingsSnapshot, type SettingsSnapshot } from './settingsDecryptService';

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 30000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One node's settings snapshot, decrypted with this phone's key: ask the node, poll until it
 * answers (30 s), decrypt. For screens that read several nodes at once (Credentials); the
 * node settings screen and useSettingsSnapshot keep their own flows.
 */
export async function fetchSettingsSnapshot(nodeId: string): Promise<SettingsSnapshot> {
  const { request_id } = await requestSettingsSnapshot(nodeId);
  const start = Date.now();
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    let result;
    try {
      result = await pollSettingsResult(nodeId, request_id);
    } catch {
      result = null; // a 202 can throw in some axios configs: still pending
    }
    if (result?.status === 'fulfilled' && result.snapshot) {
      return decryptSettingsSnapshot(nodeId, result.snapshot.ciphertext, result.snapshot.nonce, result.snapshot.tag);
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error('Node did not respond in time. Is it online?');
}
