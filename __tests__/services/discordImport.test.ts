import { parseDiscordDetails } from '../../src/services/discordImport';

const TOKEN = 'MTAwMDAwMDAwMDAwMDAwMDA0.GabcDe.abcdefghijklmnopqrstuvwxyz0123456789ABCD';

describe('parseDiscordDetails', () => {
  it('reads the labelled lines a password manager copies', () => {
    const { details, errors } = parseDiscordDetails(
      [
        'username: Jarvis',
        `password: ${TOKEN}`,
        'Channel ID: 100000000000000002',
        'ApplicationID: 100000000000000004',
        'Voice Channel ID: 100000000000000003',
        'Server ID: 100000000000000001',
      ].join('\n'),
    );
    expect(errors).toEqual([]);
    expect(details).toEqual({
      token: TOKEN,
      guildId: '100000000000000001',
      channelId: '100000000000000002',
      voiceChannelId: '100000000000000003',
    });
  });

  it('does not read the voice channel ID as the text channel', () => {
    const { details } = parseDiscordDetails('Voice Channel ID: 100000000000000003');
    expect(details).toEqual({ voiceChannelId: '100000000000000003' });
  });

  it('reads JSON with loose key names', () => {
    const { details, errors } = parseDiscordDetails(
      JSON.stringify({ bot_token: TOKEN, guild_id: '100000000000000001', channelId: '100000000000000002' }),
    );
    expect(errors).toEqual([]);
    expect(details.token).toBe(TOKEN);
    expect(details.guildId).toBe('100000000000000001');
    expect(details.channelId).toBe('100000000000000002');
  });

  it('accepts KEY=value and quoted values', () => {
    const { details } = parseDiscordDetails(`DISCORD_TOKEN="${TOKEN}"\nCHANNEL_ID=100000000000000002`);
    expect(details.channelId).toBe('100000000000000002');
    // "DISCORD_TOKEN" is not a label we know: the token is left for the person to type, not guessed.
    expect(details.token).toBeUndefined();
  });

  it('reports a bad ID and never echoes the token in an error', () => {
    const { details, errors } = parseDiscordDetails(`Bot Token: ${TOKEN} extra words\nChannel ID: #jarvis`);
    expect(details).toEqual({});
    expect(errors).toHaveLength(2);
    expect(errors.join(' ')).not.toContain(TOKEN);
    expect(errors.join(' ')).toContain('channel ID');
  });

  it('says so when it finds nothing', () => {
    const { details, errors } = parseDiscordDetails('hello there');
    expect(details).toEqual({});
    expect(errors[0]).toMatch(/No Discord details found/);
  });
});
