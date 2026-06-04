import {
  deleteRecord,
  getRecord,
  getSchema,
  listCommands,
  listNodes,
  listRecords,
  updateRecord,
} from '../../src/api/commandDataApi';
import apiClient from '../../src/api/apiClient';

jest.mock('../../src/api/apiClient', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('../../src/config/serviceConfig', () => ({
  ...jest.requireActual('../../src/config/serviceConfig'),
  getCommandCenterUrl: jest.fn().mockReturnValue('http://10.0.0.10:7703'),
}));

const BASE = 'http://10.0.0.10:7703/api/v0/mobile/command-data';

describe('commandDataApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('listNodes hits /nodes and unwraps the envelope', async () => {
    (apiClient.get as jest.Mock).mockResolvedValueOnce({
      data: { nodes: [{ node_id: 'n1', household_id: 'h1', room: 'kitchen' }] },
    });
    const result = await listNodes();
    expect(apiClient.get).toHaveBeenCalledWith(`${BASE}/nodes`);
    expect(result).toEqual([{ node_id: 'n1', household_id: 'h1', room: 'kitchen' }]);
  });

  it('listNodes returns [] when envelope is empty', async () => {
    (apiClient.get as jest.Mock).mockResolvedValueOnce({ data: {} });
    expect(await listNodes()).toEqual([]);
  });

  it('listCommands hits the per-node path', async () => {
    (apiClient.get as jest.Mock).mockResolvedValueOnce({
      data: { commands: [{ command_name: 'reminder', mode: 'enabled', storage_name: 'set_reminder' }] },
    });
    const result = await listCommands('n1');
    expect(apiClient.get).toHaveBeenCalledWith(`${BASE}/nodes/n1/commands`);
    expect(result).toHaveLength(1);
    expect(result[0].command_name).toBe('reminder');
  });

  it('getSchema returns the typed schema', async () => {
    (apiClient.get as jest.Mock).mockResolvedValueOnce({
      data: {
        mode: 'enabled',
        fields: [{ name: 'text', type: 'string' }],
      },
    });
    const schema = await getSchema('n1', 'reminder');
    expect(apiClient.get).toHaveBeenCalledWith(`${BASE}/nodes/n1/commands/reminder/schema`);
    expect(schema.mode).toBe('enabled');
    expect(schema.fields).toHaveLength(1);
  });

  it('listRecords returns records + truncation flag', async () => {
    (apiClient.get as jest.Mock).mockResolvedValueOnce({
      data: { records: [], truncated: true, count: 0 },
    });
    const result = await listRecords('n1', 'reminder');
    expect(apiClient.get).toHaveBeenCalledWith(`${BASE}/nodes/n1/commands/reminder/records`);
    expect(result.truncated).toBe(true);
  });

  it('getRecord URL-encodes the key', async () => {
    (apiClient.get as jest.Mock).mockResolvedValueOnce({
      data: { record: {}, schema: { mode: 'enabled', fields: [] } },
    });
    await getRecord('n1', 'reminder', 'rem with space');
    expect(apiClient.get).toHaveBeenCalledWith(
      `${BASE}/nodes/n1/commands/reminder/records/rem%20with%20space`,
    );
  });

  it('updateRecord wraps the patch in {patch: ...}', async () => {
    (apiClient.patch as jest.Mock).mockResolvedValueOnce({ data: { record: { text: 'x' } } });
    await updateRecord('n1', 'reminder', 'rem_1', { text: 'x' });
    expect(apiClient.patch).toHaveBeenCalledWith(
      `${BASE}/nodes/n1/commands/reminder/records/rem_1`,
      { patch: { text: 'x' } },
    );
  });

  it('deleteRecord hits the delete endpoint', async () => {
    (apiClient.delete as jest.Mock).mockResolvedValueOnce({ data: { ok: true } });
    await deleteRecord('n1', 'reminder', 'rem_1');
    expect(apiClient.delete).toHaveBeenCalledWith(
      `${BASE}/nodes/n1/commands/reminder/records/rem_1`,
    );
  });
});
