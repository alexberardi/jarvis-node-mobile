# Plan: Jarvis in Android Auto (messaging contact)

Status: Phase 1 built for the Tailscale and public URL transports (tests and typecheck pass; Kotlin not yet compiled or run on a device or the DHU). Discord transport waits for jarvis-server PR #649 to merge. Branch `feature/android-auto`, worktree `../jarvis-node-mobile-android-auto`. Deploy waits for the jarvis-server `feature/discord-bridge` branch to merge (Discord transport only).

## Context

Android Auto does not let third-party apps be the voice assistant. It does let a messaging app show a
conversation: the user says "Hey Google, message Jarvis <command>", Android Auto dictates it, passes it to
the app, and reads the app's reply aloud. This plan adds that to `jarvis-node-mobile` (Android only).
Tailscale or public reachability is assumed, so no network work is needed.

**No server change.** jarvisd already serves `POST /api/v0/mobile/chat` (SSE, JWT, body
`{message, node_id, household_id, conversation_id}`), and the app already has a client for it:
`sendChatMessage` in `src/api/chatApi.ts:193`, with 401 refresh handled. Reuse it, do not reimplement in Kotlin.

## What Home Assistant actually does (checked in source)

`home-assistant/android` does not use messaging. It uses the **Car App Library, category IOT**:
`HaCarAppService : CarAppService` (`app/src/main/kotlin/io/homeassistant/companion/android/vehicle/`),
`GridTemplate` screens of user-picked "favourite" entities, `automotive_app_desc.xml` = `<uses name="template"/>`,
manifest `androidx.car.app.minCarApiLevel`, intent-filter category `androidx.car.app.category.IOT`, dependency
`androidx.car.app:app-projected` (1.7.0), `createHostValidator()` allowlist.
Google's [IoT quality rule IT-1](https://developer.android.com/docs/quality-guidelines/car-app-quality?category=iot)
allows only viewing state, one-touch on/off, running a scene/routine, and notifications while driving. No
setup, no fine control, and no free-form chat or voice in that category.

So there are two distinct Android Auto surfaces, and Jarvis can use both:

| Phase   | Surface                                                | Good for                                            | Reference                                                                             |
| ------- | ------------------------------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Phase 1 | Messaging notifications (what Messenger and Teams use) | Free-form voice commands and spoken or text replies | [messaging docs](https://developer.android.com/training/cars/communication/messaging) |
| Phase 2 | Car App Library, IOT (what Home Assistant uses)        | One-touch routines and devices on the car screen    | [IoT docs](https://developer.android.com/training/cars/apps/iot)                      |

Correction to my earlier answer: I said messaging was the only route. IOT templates are a second one, but
they cannot carry a Jarvis conversation. `CarAudioRecord` (car mic, Car API level 5) exists but I could not
confirm it is permitted for IOT apps in review, so it is not planned.

## Working location

Another CLI session is on `feature/fleet-node-config` in
`/mnt/user/Scripts/GitHub/alexberardi/jarvis-node-mobile`. Do not touch that checkout.
1. `git -C <repo> fetch`, then `git worktree add ../jarvis-node-mobile-android-auto -b feature/android-auto origin/main`
   (confirm the default branch name first; per global rules, cut from latest main, never the current branch).
2. Work and `npm install` there. Use `EnterWorktree` with `path` if the harness supports it.
3. This workspace (`Docker/Jarvis`): add a CHANGELOG entry and update the `Compare-GoFeatures.md` row 4
   (Android assistant replacement) to point at the new branch. Mobile repo changes follow its own `CLAUDE.md`
   (read it again before editing).

## Design

Flow: car dictation -> notification Reply action -> native receiver -> headless JS task -> `sendChatMessage`
-> final text -> native module posts a MessagingStyle notification -> Android Auto reads it out.

### New files (mobile repo)

- No config plugin (changed during build): the module's own library manifest declares the car meta-data,
  receivers, service and `POST_NOTIFICATIONS`, and ships `res/xml/automotive_app_desc.xml`, all merged into
  the app at build time. Less code than the plugin and nothing to regenerate on prebuild.
- `modules/jarvis-car/` (same shape as `modules/jarvis-crypto`: `expo-module.config.json`, `android/`,
  `index.ts`). Kotlin:
  - `CarNotifier`: creates the channel, posts `NotificationCompat.MessagingStyle` with a Reply action
    (`RemoteInput`, `SEMANTIC_ACTION_REPLY`, `setShowsUserInterface(false)`) and a Mark-as-read action
    (`SEMANTIC_ACTION_MARK_AS_READ`, `setShowsUserInterface(false)`), plus `CarExtender` with an
    `UnreadConversation`/conversation so Auto treats it as a conversation
  - `ReplyReceiver`: extracts the `RemoteInput` text and starts `CarReplyTaskService`
  - `MarkReadReceiver`: cancels the notification
  - `CarReplyTaskService extends HeadlessJsTaskService`: runs task `JarvisCarReply` with `{text}`
  - Expo module function `postReply(text: string)` calls `CarNotifier` (JS uses it to deliver Jarvis's answer)
- `src/services/carChatService.ts`: the headless task body.
  - get access token from `src/services/tokenStorage.ts` and household/node ids from the same sources
    `useChat` uses (`src/hooks/useChat.ts:457`)
  - node target: the node last used in chat, else the first online node (decision, change if wrong)
  - pick a transport (Tailscale, then Discord, then public URL; see "Fallback" below), call
    `sendChatMessage` for the HTTP ones, collect `delta`/`done.full_text`, keep `conversation_id` for follow-ups
  - Settings screen gains `publicUrl` and a `discordFallback` toggle (`src/screens/Settings/`)
  - build order: Tailscale path first, public URL second, Discord last (depends on the other session's branch)
  - strip markdown, cap length (~400 chars) so it reads well aloud
  - call `postReply`; on `error` or no token post a short spoken failure ("Open Jarvis to sign in")
- `index.ts`: `AppRegistry.registerHeadlessTask('JarvisCarReply', () => carChatService)`.
- `package.json`: `"jarvis-car": "file:./modules/jarvis-car"` (autolinked). `POST_NOTIFICATIONS` comes from the
  module manifest; the runtime prompt is already requested by `expo-notifications`.
- `docs/decisions/2026-11-13-android-auto.md`: decision record (messaging category, why not assistant,
  Play review, headless approach).
- `CHANGELOG.md` entry (project rule, `yyyyMMdd-HHmm`).

### Known risks (decide before or during build)

1. **Biometric-gated refresh token.** CLAUDE.md says the refresh token can require Face ID/fingerprint.
   A headless task cannot prompt, so if the access token has expired and biometrics are on, the refresh
   fails. Mitigation: post the "open Jarvis to sign in" reply; do not change the security model.
2. **Headless task cold start** adds latency (a second or two) on the first reply after the app was killed.
3. **Play Store**: messaging apps in Android Auto go through a review. Start with sideload / internal
   testing (Android Auto developer mode + "Unknown sources").
4. Replies are asynchronous notifications, so no live streaming audio and no on-screen confirmation buttons.
   Confirmations must be spoken questions.
5. Tailscale must be connected on the phone (set Always-on VPN).

## Verification

1. `npm test`: add Jest tests for `carChatService` (mock `sendChatMessage`: delta/done, error, no token,
   markdown stripping, length cap). Run `npm test` and the repo's lint/typecheck.
2. `npx expo prebuild --platform android --clean` and confirm the generated manifest has the meta-data,
   receivers and service, and `automotive_app_desc.xml` exists.
3. Build a dev APK (`npm run android` or EAS `development`), install on the phone.
4. Desktop Head Unit (Android Studio SDK Manager "Android Auto Desktop Head Unit"):
   enable developer mode and head unit server on the phone, `adb forward tcp:5277 tcp:5277`, start the DHU.
   Post a test conversation, say a command, confirm the reply is read aloud and the server shows the
   chat turn (jarvisd traces).
5. Kill the app, repeat (headless cold path). Then repeat with the phone on Tailscale only.
6. Real car pass is the user's: acceptance is "message Jarvis a lights command, hear the result".

## Phase 2 (after Phase 1 is verified): IOT routine and device grid

Pattern copied from Home Assistant's `HaCarAppService` / `MainVehicleScreen`, trimmed:
- Kotlin `JarvisCarAppService : CarAppService` (IOT category, `HostValidator` allowlist, debug allows all),
  one `GridTemplate` screen of favourites, tap = run routine / toggle device, then show the result.
- Add `androidx.car.app:app-projected` and `app` in the module's `build.gradle`, `minCarApiLevel`,
  and `<uses name="template"/>` next to the notification entry in `automotive_app_desc.xml`.
- Data: the favourites list is chosen on the phone (setup is banned while driving). The app's existing
  `routineApi.ts` and `smartHomeApi.ts` supply routines and devices; a tap starts a headless JS task the
  same way Phase 1 does (reuse `carChatService` plumbing, add a `runRoutine` task).
- Limit to one-touch actions (IT-1), at most five screens, 2 s button response (DR-1).

Needs a user decision before Phase 2 starts: which routines/devices are offered, and whether favourites
are set in a new Settings screen. Left out of Phase 1.

## Phase 3 (spike first): Jarvis as a music source (Android Auto Media category)

State today: Jarvis does not stream music to phones. Music Assistant (MA, `http://10.10.11.159:8095`) plays
on Jarvis nodes (the Surface and Pi are MA players over `sendspin`), and the mobile app has no music player
(only `expo-av` for inbox clips, `src/services/inboxAudioService.ts`). So "play through the car" means the
phone becomes an MA player or streams from MA, and the app becomes an Android Auto **media app**.

What a media app needs (Android for Cars, media category; a separate surface from Phases 1 and 2):
- A Media3 `MediaLibraryService` (or `MediaBrowserServiceCompat`) in Kotlin that exposes a browse tree
  (recent, playlists, search) and owns an ExoPlayer with a `MediaSession`. `expo-av` cannot be the session
  owner, so this is native, not React Native.
- Voice: Google's quality rule VC-1 says media apps must support Gemini and Google Assistant voice
  commands ("play Korn on Jarvis"), implemented through the session's `onPlayFromSearch`.
- A source of playable audio. Unverified, must be checked in the spike: (a) can a phone be an MA
  player (a Sendspin client on Android), or (b) does MA expose an HTTP stream per queue or track the phone
  can play with a Bearer token? Option (b) is the simpler fit for ExoPlayer. MA's REST call is
  `POST /api {"command","args"}` per the music notes.
- Reachability: the MA host is on the 10.10.11.x VLAN, so the phone needs Tailscale (or a published URL)
  to MA itself, not only to jarvisd. Check whether jarvisd proxies MA (the `internal/agent/music` package
  in jarvis-server is node-side) or whether the app talks to MA directly.
- Overlap: Spotify and YouTube Music already have car apps. The value of a Jarvis media app is MA's mixed
  library (Emby, TuneIn, Spotify) in one place, and "Jarvis, play X" routing.

Deliverable of the spike (no product code): a one-page result saying which of (a) or (b) works, the auth
needed, and an estimate. Build Phase 3 only after that and your go-ahead.

## Fallback when Tailscale is down: the Discord bridge (open question)

Two different bridges exist; only one is relevant.
- Codeman's bridge (`~/.codeman/app/docs/discord-bridge.md`) types replies into CLI agent tabs. Wrong target:
  it would send car commands to a shell-capable Claude session, not Jarvis. Not used.
- jarvis-server's bridge (branch `feature/discord-bridge`, `docs/discord-bridge.md`, in progress in the other
  session): a per-household bot that connects **outbound** to Discord and runs a DM or channel message through
  the same chat pipeline as `/mobile/chat`, replying in place. Only linked accounts are answered, and Jarvis
  never starts a conversation. So the server side already works with no inbound route and no VPN.

The gap is the phone's side of the car flow:
- Sending: the app would have to post a Discord message *as the user*. Automating a user account is against
  Discord's rules, and the bridge ignores other bots and webhooks. Options: (1) a second, car-only bot whose
  token lives on the phone and whose messages the server maps to the linked user (needs a jarvis-server change
  on the other session's branch, and puts a secret on the phone); (2) skip sending and let the user use the
  Discord app (not hands-free).
- Receiving: the app would need to read Discord replies (gateway or REST polling with that bot token) and then
  post the car notification. Discord's own app notifications are not something I can confirm Android Auto reads.
- Cost: more code in the car path, plus a transport switch (try jarvisd, fall back to Discord).

**Decision (user): three transports, tried in this order.**
1. **Tailscale** (primary): the existing server URL from `getCommandCenterUrl()`, via `sendChatMessage`.
2. **Discord** (second): through the jarvis-server bridge.
3. **Public URL** (last resort, expected to be rarely used): a second base URL, same `/api/v0/mobile/chat` and JWT.

Design (in `src/services/carChatService.ts`, one function per transport, no framework):
- Probe the Tailscale URL's `/health` with a short timeout (~2 s, inside the DR-1 budget). Reachable: use it.
- Otherwise try Discord, then the public URL. A transport that fails mid-request moves to the next one.
  Discord has no streaming, so its reply arrives whole.
- A new setting `publicUrl` (Settings, optional, empty = skipped) and `discordFallback` (opt-in toggle).
  Remember the last working transport for the session to skip the probe.
- Spoken failure only after all enabled transports fail: "I can't reach Jarvis."

Discord transport needs three things that do not exist yet, so it is built last in Phase 1 and gated on them:
- **jarvis-server change** on `feature/discord-bridge` (the other session owns it): let a car-only bot's
  messages count as the linked user, and add a car-bot token setting beside the main one. Coordinate, do not
  edit that branch from here.
- **Phone side**: send as the car-only bot over Discord's REST API, then read the reply (poll the thread or
  channel for the bot's answer, ~1 s interval, timeout ~20 s). The car-bot token is stored in SecureStore and
  never logged. A user-account token is not used (against Discord's rules).
- **Security note**: a stolen phone holds a token that acts as that user, so keep the bot private, one
  per household, scoped to the `#jarvis` channel, and allow revoking it from the app.

Risk to flag: Discord adds latency (a few seconds) and depends on the bridge branch merging. If that stalls,
Phase 1 still ships with transports 1 and 3.

## Out of scope

Wake word or assistant replacement, custom audio/TTS in the car, a car screen UI (Car App Library
templates), iOS CarPlay, Play Store submission, any jarvisd change.
