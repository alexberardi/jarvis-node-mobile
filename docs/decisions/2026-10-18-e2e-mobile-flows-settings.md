# Mobile E2E flows: settings, household, nodes, memories, phonebook, call details, auth, deep links

- **Date:** 2026-10-18 (loop item #153, E2E piece 6 of the regression plan; the user's
  decisions of 2026-10-17, the rest by agent)

The Maestro flows for the settings side of the app, run overnight by jarvis-server's
`scripts/e2e mobile` against a seeded rich sandbox. The runner and its contract are
jarvis-server's `docs/decisions/2026-10-18-e2e-mobile-runner.md`.

## Decisions

- **Maestro, the scripted model, no packages (user, 2026-10-17).** Pantry/store screens and
  the node's Packages tab get no flow; they are listed in `.maestro/COVERAGE.md` as
  `not tested: packages (user, 2026-10-17)`. Camera, biometrics and visual polish stay
  manual: the theme switch is flipped, its colours are not checked.
- **Flows are top-level in `.maestro/`, not `.maestro/e2e/`.** The item asked for
  `.maestro/e2e/`, but the runner runs only top-level files and treats subdirectories as
  subflows, so flows there would never run. Shared steps are in `.maestro/subflows/`; the
  old top-level `login.yaml` moved there, and the iOS-era flows (biometric login,
  provisioning, K2) are tagged `skip` with their reasons.
- **One login subflow per account, by env.** `subflows/login-as.yaml` takes `LOGIN_EMAIL`
  (the runner's `EMAIL_*`, or a throwaway account's); `subflows/login.yaml` is the
  superuser. Switching accounts is `launchApp: {clearState: true}` and a new login, not
  the Log Out button: it is quicker and leaves nothing behind.
- **No seeded role changes.** The role-change test runs on an account the flow makes: the
  admin creates a 1-use invite in the app, the flow copies the code, registers with it,
  promotes the new member to power user, checks what the account then sees, and deletes it
  (Settings → Delete Account). The seeded member and power user are only looked at
  (`household-member-view.yaml`). A failed run leaves at most one uniquely named
  `e2e-<time>@jarvisautomation.io` account, which no other flow looks for.
- **What a flow changes, it changes back, or it makes its own.** The household rename is
  renamed back (the screen keeps the name it opened with, so the flow reopens it); the
  presence.left automation is cleared; memories, phonebook entries and call details are
  created with a per-run unique name and deleted. Each flow's header says what is left
  behind if it dies midway.
- **Register goes through an invite.** jarvisd refuses an invite-less sign-up once a
  superuser exists, so `register.yaml` checks the form's own errors (bad invite, short
  password) and then registers with an invite, as a new household member does.
- **The forced password change is written but skipped.** The app cannot issue a temporary
  password (the web admin does), and the flows have no way to reach jarvisd's API: the
  runner passes no URL for it. `force-password-change.yaml` sets its account up with a
  `runScript` (`subflows/temp-password-account.js`: invite, register, `POST
  /superuser/users/{id}/temp-password`) that needs `AUTH_URL`; it is tagged `skip` until
  the runner passes that (a jarvis-server change).
- **Android gets the quick-open scheme.** `app.json` registered `com.jarvis.app` only in
  iOS's `CFBundleURLTypes`; Expo registers no custom scheme on Android without one, so
  `com.jarvis.app://chat` never reached the Android app. `android.intentFilters` now
  routes it (VIEW, BROWSABLE, DEFAULT), with no change to iOS. The
  `https://docs.jarvisautomation.dev/app/...` Universal Link stays iOS-only: it exists for
  the Control Center control, and Android would need a verified App Link for it.
- **testIDs where the flows need them**, named `<screen>-<thing>` like the existing ones:
  the tab bar (`tab-home` … `tab-nodes`), Landing, Register, Set a New Password, the login
  error, Settings' sections and rows, the household's member rows (by email, since user ids
  differ per sandbox), invite codes and the invite dialog, the voice profile's intro and
  picker, node cards (by node id), the node detail's tabs and cog, the node settings'
  states, the Hardware tab, and Home's mic and listening bar.
- **The flows are checked by `npm test`.** `__tests__/maestro/flows.test.ts` reads every
  flow and fails when a top-level flow breaks the runner contract (appId, `clearState`,
  skip reason), a `runFlow`/`runScript` file is missing, or an `id:` selector names a
  testID that no longer exists in `src/`. It catches a renamed testID at PR time instead of
  overnight.

## Not covered here

- Node rename: the app has no rename for a node.
- Node settings beyond "key required": loading a node's settings needs a live node to
  answer, which the seeded nodes are not.
- Voice recording (the voice lane), home presence (needs a location fix), the pantry toggle
  and Packages (packages).
- Chat, Devices, Routines and Inbox are #145's.
