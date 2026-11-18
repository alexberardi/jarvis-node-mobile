import type {
  AuthenticationConfig,
} from '../types/SmartHome';
import type { CommandSecretEntry, SettingsSnapshot } from '../services/settingsDecryptService';

/** One setting (API key, account, option) a credential has, as its first node describes it. */
export type CredentialField = Omit<CommandSecretEntry, 'is_set' | 'value'>;

/** A credential on one node: which of its fields are set there. */
export interface CredentialOnNode {
  nodeId: string;
  set: Record<string, boolean>;
  /** Plain values the node shared (never sensitive ones). */
  values: Record<string, string | undefined>;
}

export interface Credential {
  /** service:<name> for packages, device:<family> for device protocols. */
  id: string;
  name: string;
  kind: 'service' | 'device';
  auth?: AuthenticationConfig;
  setupGuide?: string;
  fields: CredentialField[];
  nodes: CredentialOnNode[];
}

export interface NodeSnapshot {
  nodeId: string;
  snapshot: SettingsSnapshot;
}

/**
 * Every credential across the nodes this phone can read, merged by service: the same
 * service on two nodes is one credential with two nodes. A service with no secrets and no
 * sign-in has nothing to set, so it isn't one.
 */
export function collectCredentials(snapshots: NodeSnapshot[]): Credential[] {
  const byId = new Map<string, Credential>();
  const add = (
    id: string,
    name: string,
    kind: Credential['kind'],
    nodeId: string,
    secrets: CommandSecretEntry[],
    auth?: AuthenticationConfig,
    setupGuide?: string,
  ) => {
    if (secrets.length === 0 && !auth) return;
    let c = byId.get(id);
    if (!c) {
      c = { id, name, kind, fields: [], nodes: [] };
      byId.set(id, c);
    }
    c.auth = c.auth ?? auth;
    c.setupGuide = c.setupGuide ?? setupGuide;
    let onNode = c.nodes.find((n) => n.nodeId === nodeId);
    if (!onNode) {
      onNode = { nodeId, set: {}, values: {} };
      c.nodes.push(onNode);
    }
    for (const s of secrets) {
      if (!c.fields.some((f) => f.key === s.key)) {
        const { is_set: _set, value: _value, ...field } = s;
        c.fields.push(field);
      }
      onNode.set[s.key] = onNode.set[s.key] || s.is_set;
      if (!s.is_sensitive && s.value != null) onNode.values[s.key] = s.value;
    }
  };
  for (const { nodeId, snapshot } of snapshots) {
    for (const cmd of snapshot.commands ?? []) {
      const name = cmd.associated_service || cmd.command_name;
      add(`service:${name}`, name, 'service', nodeId, cmd.secrets ?? [], cmd.authentication, cmd.setup_guide);
    }
    for (const agent of snapshot.agents ?? []) {
      const name = agent.associated_service || agent.agent_name;
      add(`service:${name}`, name, 'service', nodeId, agent.secrets ?? []);
    }
    for (const fam of snapshot.device_families ?? []) {
      add(`device:${fam.family_name}`, fam.friendly_name || fam.family_name, 'device', nodeId, fam.secrets ?? [], fam.authentication, fam.setup_guide);
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Required fields a node's packages declare but that aren't set there. */
export const missingOn = (c: Credential, n: CredentialOnNode): CredentialField[] =>
  c.fields.filter((f) => f.required && n.set[f.key] === false);

export const needsSetup = (c: Credential): boolean => c.nodes.some((n) => missingOn(c, n).length > 0);

export const isPersonal = (c: Credential): boolean => c.fields.some((f) => f.scope === 'user');

/** A field across the nodes it's on: set everywhere, somewhere, or nowhere. */
export const fieldStatus = (
  c: Credential,
  f: CredentialField,
  nodeIds: string[],
): 'set' | 'partly' | 'required' | 'optional' => {
  // Only the nodes whose packages declare this field.
  const on = c.nodes.filter((n) => nodeIds.includes(n.nodeId) && f.key in n.set);
  const setCount = on.filter((n) => n.set[f.key]).length;
  if (on.length > 0 && setCount === on.length) return 'set';
  if (setCount > 0) return 'partly';
  return f.required ? 'required' : 'optional';
};
