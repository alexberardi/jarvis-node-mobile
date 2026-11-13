# Discord card in household settings

Status: accepted (mobile side of the jarvisd Discord bridge, `docs/discord-bridge.md` in jarvis-server). Date: 2026-11-13.

The Discord bridge lets people message Jarvis from Discord with no VPN. The author wants tokens and
keys entered only through this app, so the bot's token and IDs are set here.

- **Where.** A `Discord` card on the household settings screen (`DiscordSettingsCard`), after the
  Twilio card. It renders nothing on a server without the bridge (`discord.enabled` absent from the
  household settings).
- **The bot (admin only).** Bot token, server ID, text channel ID and an optional voice channel ID,
  written through the existing household settings route (`PUT .../settings/{key}`), like the Twilio
  credentials. The token is write only: the server returns `"********"`, so the card shows only
  whether it is set. IDs are checked as Discord IDs (15 to 22 digits) before anything is sent, and
  the server checks them again.
- **Paste details.** "Paste details from clipboard" fills the fields from text copied out of a
  password manager (`src/services/discordImport.ts`): labelled lines (`Bot Token: ...`,
  `Server ID: ...`, `Text Channel ID: ...`) or JSON. A token with spaces or odd characters is
  refused, and no error message repeats the token. Unknown labels, such as an application ID, are
  ignored.
- **Linking (every member).** `POST .../discord/link-code` gives a one-time eight character code
  (valid ten minutes); the person sends `/jarvis link` with it to the bot. When the household has
  several nodes the person picks the one Jarvis answers through first. The card also holds the
  person's own settings: reminders and alarms to Discord direct messages (off by default), voice
  replies (`auto`, `always`, `never`), and unlink.
- **Not here.** Nothing about Discord is stored on the phone, and the token is never held after the
  save: the field is cleared when the editor closes.
