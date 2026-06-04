/**
 * Mobile command-data browser API client.
 *
 * Talks to jarvis-command-center's `/api/v0/mobile/command-data/*`
 * endpoints. CC fans out to the relevant node over MQTT and waits for
 * the response, so each call here costs one MQTT round-trip (~50-500ms
 * depending on broker hop + Pi load).
 */
import { getCommandCenterUrl } from '../config/serviceConfig';
import apiClient from './apiClient';

// ── Wire shapes ────────────────────────────────────────────────────────────

/** One field's schema entry, declared by the command via `editable_fields()`.
 *
 * `type` is a free-form string so new types ship from the SDK without
 * mobile rebuilds. Unknown types render as plain text inputs with a
 * "field type X not supported" hint.
 */
export interface FieldSpec {
  name: string;
  type: string;
  label?: string;
  description?: string;
  editable?: boolean;
  required?: boolean;
  enum_values?: string[];
  item_type?: string;
  fields?: FieldSpec[];
  placeholder?: string;
}

export interface CommandSchema {
  mode: 'enabled' | 'disabled' | 'readonly' | string;
  fields: FieldSpec[];
}

export interface RecordSummary {
  title: string;
  subtitle: string | null;
  icon: string;
}

export interface DataRecord {
  key: string;
  summary: RecordSummary;
  data: Record<string, unknown>;
}

export interface NodeSummary {
  node_id: string;
  household_id: string;
  room: string | null;
}

export interface CommandSummary {
  command_name: string;
  mode: string;
  storage_name: string;
}

// ── API surface ────────────────────────────────────────────────────────────

const base = (): string => `${getCommandCenterUrl()}/api/v0/mobile/command-data`;

export const listNodes = async (): Promise<NodeSummary[]> => {
  const res = await apiClient.get<{ nodes: NodeSummary[] }>(`${base()}/nodes`);
  return res.data.nodes ?? [];
};

export const listCommands = async (
  nodeId: string,
): Promise<CommandSummary[]> => {
  const res = await apiClient.get<{ commands: CommandSummary[] }>(
    `${base()}/nodes/${encodeURIComponent(nodeId)}/commands`,
  );
  return res.data.commands ?? [];
};

export const getSchema = async (
  nodeId: string,
  commandName: string,
): Promise<CommandSchema> => {
  const res = await apiClient.get<CommandSchema>(
    `${base()}/nodes/${encodeURIComponent(nodeId)}/commands/${encodeURIComponent(commandName)}/schema`,
  );
  return res.data;
};

export interface ListRecordsResult {
  records: DataRecord[];
  truncated: boolean;
  count: number;
}

export const listRecords = async (
  nodeId: string,
  commandName: string,
): Promise<ListRecordsResult> => {
  const res = await apiClient.get<ListRecordsResult>(
    `${base()}/nodes/${encodeURIComponent(nodeId)}/commands/${encodeURIComponent(commandName)}/records`,
  );
  return res.data;
};

export interface GetRecordResult {
  record: Record<string, unknown>;
  schema: CommandSchema;
}

export const getRecord = async (
  nodeId: string,
  commandName: string,
  key: string,
): Promise<GetRecordResult> => {
  const res = await apiClient.get<GetRecordResult>(
    `${base()}/nodes/${encodeURIComponent(nodeId)}/commands/${encodeURIComponent(commandName)}/records/${encodeURIComponent(key)}`,
  );
  return res.data;
};

export const updateRecord = async (
  nodeId: string,
  commandName: string,
  key: string,
  patch: Record<string, unknown>,
): Promise<{ record: Record<string, unknown> }> => {
  const res = await apiClient.patch<{ record: Record<string, unknown> }>(
    `${base()}/nodes/${encodeURIComponent(nodeId)}/commands/${encodeURIComponent(commandName)}/records/${encodeURIComponent(key)}`,
    { patch },
  );
  return res.data;
};

export const deleteRecord = async (
  nodeId: string,
  commandName: string,
  key: string,
): Promise<void> => {
  await apiClient.delete(
    `${base()}/nodes/${encodeURIComponent(nodeId)}/commands/${encodeURIComponent(commandName)}/records/${encodeURIComponent(key)}`,
  );
};
