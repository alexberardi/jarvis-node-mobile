/**
 * Signal automations (jarvis-command-center) — the free-text-per-signal rules.
 *
 * Talks to CC's `/api/v0/mobile/household/{id}/signal-automations` endpoints. GET
 * returns the catalog of signal kinds this household can react to, each annotated
 * with whether it's been *observed* firing + the current instruction/enabled. PUT
 * sets (or clears, with a blank instruction) one kind's rule. Authorized by the
 * caller's role in the household (admin to write); the JWT is attached by
 * apiClient. Powers the Signal Automations screen.
 */
import { getCommandCenterUrl } from '../config/serviceConfig';
import apiClient from './apiClient';

/** One authorable signal kind + the household's current rule for it. */
export interface SignalAutomation {
  /** Stable signal kind, e.g. "presence.left". */
  kind: string;
  /** Event-phrased header, e.g. "I leave home". */
  label: string;
  /** One line: when it fires. */
  description: string;
  /** Fact key → what it means (the data this signal carries). */
  facts: Record<string, string>;
  /** Example instruction, for the input placeholder. */
  example: string;
  /** Typical source_agent (for display). */
  source: string;
  /** True if this kind has actually fired for the household (vs. merely possible). */
  observed: boolean;
  /** The current free-text instruction ("" if none). */
  instruction: string;
  /** Whether the rule is enabled. */
  enabled: boolean;
}

const base = (householdId: string) =>
  `${getCommandCenterUrl()}/api/v0/mobile/household/${householdId}/signal-automations`;

/** Fetch the catalog + this household's current rule per signal kind. */
export const getSignalAutomations = async (
  householdId: string,
): Promise<SignalAutomation[]> => {
  const res = await apiClient.get<{ household_id: string; automations: SignalAutomation[] }>(
    base(householdId),
  );
  return res.data.automations;
};

/** Result of a save: the persisted instruction + whether it cleared the rule. */
export interface SetAutomationResult {
  instruction: string;
  enabled: boolean;
  cleared: boolean;
}

/**
 * Set one signal kind's instruction (requires household admin). A blank
 * instruction clears the rule.
 */
export const setSignalAutomation = async (
  householdId: string,
  kind: string,
  instruction: string,
  enabled: boolean,
): Promise<SetAutomationResult> => {
  const res = await apiClient.put<{
    success: boolean;
    instruction: string;
    enabled: boolean;
    cleared: boolean;
  }>(`${base(householdId)}/${encodeURIComponent(kind)}`, { instruction, enabled });
  return {
    instruction: res.data.instruction,
    enabled: res.data.enabled,
    cleared: res.data.cleared,
  };
};
