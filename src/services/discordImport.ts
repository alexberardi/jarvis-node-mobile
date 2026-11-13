/**
 * Reads the Discord bot details an admin copies from a password manager or notes app, so the
 * bot token and IDs go in with one paste instead of four typed fields.
 *
 * Accepted shapes:
 *   - JSON: {"token": "...", "guild_id": "...", "channel_id": "...", "voice_channel_id": "..."}
 *   - lines, one per field: `Bot Token: ...`, `Server ID = ...`, `Channel ID: ...`, `Voice Channel ID: ...`
 * Labels are matched loosely (case, spaces, dashes and underscores do not matter).
 *
 * Nothing here logs or returns the token anywhere but the parsed result.
 */

export interface DiscordDetails {
  token?: string;
  guildId?: string;
  channelId?: string;
  voiceChannelId?: string;
}

export interface DiscordImportResult {
  details: DiscordDetails;
  /** Problems the person should fix before saving (never contain the token). */
  errors: string[];
}

/** A Discord ID (snowflake): 15 to 22 digits, as the server checks. */
export const DISCORD_ID_PATTERN = /^[0-9]{15,22}$/;

type Field = keyof DiscordDetails;

// Longest labels first so "voice channel id" is not read as "channel id".
const LABELS: Array<[RegExp, Field]> = [
  [/^(voicechannel(id)?|voiceid)$/, 'voiceChannelId'],
  [/^(guild(id)?|server(id)?)$/, 'guildId'],
  [/^(channel(id)?|textchannel(id)?)$/, 'channelId'],
  [/^(bot)?(token|password|credential)$/, 'token'],
];

const field = (label: string): Field | null => {
  const key = label.toLowerCase().replace(/[^a-z]/g, '');
  for (const [re, f] of LABELS) if (re.test(key)) return f;
  return null;
};

const FIELD_NAME: Record<Field, string> = {
  token: 'bot token',
  guildId: 'server ID',
  channelId: 'channel ID',
  voiceChannelId: 'voice channel ID',
};

const fromJson = (text: string): DiscordDetails | null => {
  if (!text.startsWith('{')) return null;
  try {
    const obj = JSON.parse(text) as Record<string, unknown>;
    const out: DiscordDetails = {};
    for (const [k, v] of Object.entries(obj)) {
      const f = field(k);
      if (f && typeof v === 'string') out[f] = v.trim();
    }
    return out;
  } catch {
    return null;
  }
};

const fromLines = (text: string): DiscordDetails => {
  const out: DiscordDetails = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([^:=]+?)\s*[:=]\s*(.+?)\s*$/.exec(line);
    if (!m) continue;
    const f = field(m[1]);
    if (f && !out[f]) out[f] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  return out;
};

/** Parse pasted details. Unknown labels are ignored; bad values are reported, not kept. */
export const parseDiscordDetails = (raw: string): DiscordImportResult => {
  const text = raw.trim();
  const found = fromJson(text) ?? fromLines(text);
  const details: DiscordDetails = {};
  const errors: string[] = [];
  for (const f of Object.keys(found) as Field[]) {
    const v = found[f];
    if (!v) continue;
    if (f === 'token') {
      // A token is one run of letters, digits, dots, dashes and underscores. Anything else
      // (a space, a quote) means the paste picked up more than the token.
      if (/^[A-Za-z0-9._-]{20,}$/.test(v)) details.token = v;
      else errors.push('That does not look like a bot token (it has spaces or odd characters, or is too short).');
    } else if (DISCORD_ID_PATTERN.test(v)) {
      details[f] = v;
    } else {
      errors.push(`The ${FIELD_NAME[f]} should be a Discord ID: 15 to 22 digits.`);
    }
  }
  if (Object.keys(details).length === 0 && errors.length === 0) {
    errors.push('No Discord details found. Paste the bot token and IDs, one per line like "Channel ID: 123…".');
  }
  return { details, errors };
};
