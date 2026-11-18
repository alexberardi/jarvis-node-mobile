import { collectCredentials, fieldStatus, isPersonal, missingOn, needsSetup } from '../../src/utils/credentials';

const secret = (key: string, over: Record<string, unknown> = {}) => ({
  key, scope: 'integration', description: '', value_type: 'str', required: true, is_sensitive: true, is_set: true, ...over,
});

const snap = (commands: any[], extra: Record<string, unknown> = {}) =>
  ({ schema_version: 1, commands_schema_version: 1, commands, agents: [], device_families: [], ...extra }) as any;

describe('collectCredentials', () => {
  const kitchen = snap([
    { command_name: 'read_email', associated_service: 'Gmail', description: '', secrets: [secret('GMAIL_CLIENT_ID'), secret('GMAIL_ACCOUNT', { scope: 'user', is_sensitive: false, value: 'me@x' })] },
    { command_name: 'calculate', description: '', secrets: [] },
  ]);
  const office = snap(
    [{ command_name: 'send_email', associated_service: 'Gmail', description: '', secrets: [secret('GMAIL_CLIENT_ID', { is_set: false })] }],
    { device_families: [{ family_name: 'nest', friendly_name: 'Nest', description: '', connection_type: 'cloud', supported_domains: [], secrets: [secret('NEST_PROJECT_ID')], is_configured: true }] },
  );
  const creds = collectCredentials([{ nodeId: 'k', snapshot: kitchen }, { nodeId: 'o', snapshot: office }]);

  it('merges a service across nodes and skips packages with nothing to set', () => {
    expect(creds.map((c) => c.id)).toEqual(['service:Gmail', 'device:nest']);
    const gmail = creds[0];
    expect(gmail.nodes.map((n) => n.nodeId)).toEqual(['k', 'o']);
    expect(gmail.fields.map((f) => f.key)).toEqual(['GMAIL_CLIENT_ID', 'GMAIL_ACCOUNT']);
  });

  it('keeps only non-sensitive values', () => {
    const k = creds[0].nodes[0];
    expect(k.values).toEqual({ GMAIL_ACCOUNT: 'me@x' });
  });

  it('knows what needs setup, per node and per field, and what is personal', () => {
    const gmail = creds[0];
    expect(needsSetup(gmail)).toBe(true);
    expect(missingOn(gmail, gmail.nodes[1]).map((f) => f.key)).toEqual(['GMAIL_CLIENT_ID']);
    expect(missingOn(gmail, gmail.nodes[0])).toEqual([]);
    expect(isPersonal(gmail)).toBe(true);
    const clientId = gmail.fields[0];
    expect(fieldStatus(gmail, clientId, ['k', 'o'])).toBe('partly');
    expect(fieldStatus(gmail, clientId, ['k'])).toBe('set');
    expect(fieldStatus(gmail, clientId, ['o'])).toBe('required');
    expect(needsSetup(creds[1])).toBe(false);
  });
});
