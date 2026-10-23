# Maestro e2e flows (L2 — device e2e)

The older iOS-era flows below (provisioning, K2, biometric login) are tagged `skip` for
the Android runner; see "The overnight runner" further down for the flows it runs.

The top layer of the mobile testing pyramid (`prds/mobile-app-delivery.md` Phase 2).
These flows drive a **real dev-client build** in an iOS simulator against the
dockerized **fake node** (`jarvis-node-setup` `run_provisioning.py` + SimulatedWiFi)
on the `jarvis-integration-tests` core stack — exercising the production
provisioning code path minus the two phone-side WiFi switches, which no in-app
tool can automate.

| Flow | Proves |
|---|---|
| `provisioning-devmode-happy-path.yaml` | DEV_MODE "Simulator Mode" → connect to the fake node → NodeInfo → SelectNetwork → EnterPassword → provision → Success |
| `k2-crypto-roundtrip.yaml` | the REAL `jarvis-crypto` native module (Argon2id + AES-GCM) on **both encrypt and decrypt** — password-protected backup → clipboard → import. jest mocks the module; this is the only test that runs it. **It caught a real native crash on its first run** (an 8-byte stack overflow in `argon2.c`, SIGABRT on every Argon2id hash). |
| `schedules.yaml` | the Scheduled errands screen renders |
| `auth-roles.yaml` | every seeded role (superuser, admin, power user, member) logs in, and Settings shows the seeded household with that role; a member gets no household edit button |
| `auth-logout.yaml` | Log Out lands on Landing, and a relaunch stays logged out |
| `nav-tabs.yaml` | the five tabs open (pick them by `tab-home`, `tab-devices`, `tab-pantry`, `tab-routines`, `tab-nodes`), and Devices, Routines and Nodes show seeded data; Pantry shows its gate (the rich sandbox has Pantry off) or, with Pantry on, the pantry |
| `home-chat.yaml` | a chat message gets the scripted model's exact reply (`CHAT_MESSAGE` → `CHAT_REPLY`) |
| `home-chat-tools.yaml` | the scripted model's tool turns (`DEVICE_`, `TIMER_`, `LIST_MESSAGE`: control_device, set_timer, a shopping-list add) reach the node's dispatch: the sandbox's node is not running, so each gets its `*_REPLY_OFFLINE` |
| `inbox.yaml` | the seeded inbox opens from Home; the deep-research item shows its markdown and sources (InboxDetail), the interactive list its rows and live "Add {n}" count (InteractiveList), the deployed adapter its details (AdapterDeployed) |
| `inbox-suggestion.yaml` | the seeded suggestion card's "Never suggest this" opens the server's answer (InboxCallbackResult), Suppressed suggestions lists it, and the flow un-blocks it |
| `settings.yaml`, `household-*.yaml`, `signal-automations.yaml`, `voice-profile.yaml`, `nodes.yaml`, `memories.yaml`, `phonebook.yaml`, `call-context.yaml`, `register.yaml`, `force-password-change.yaml`, `deep-links.yaml` | E2E piece 6 (#153): see [`COVERAGE.md`](COVERAGE.md) for what each covers |

E2E piece 5 (#145): its layout and seed contract are in
[`../docs/decisions/2026-10-18-e2e-mobile-flows.md`](../docs/decisions/2026-10-18-e2e-mobile-flows.md).

Shared steps live in `subflows/` (never run on their own): `login.yaml` (the superuser),
`login-as.yaml` (any `LOGIN_EMAIL`), `logout.yaml` (Home → Settings → Log Out → Landing), `open-settings.yaml`, `open-household.yaml`,
`register-invited.yaml` (a throwaway account joined through an invite code),
`delete-account.yaml` (removes that account again) and `reset-household-name.yaml` (as the
admin, renames Avery Household back if a dead `household-edit` run left it renamed; the
flows that look for the name run it first).

## The overnight runner (Android, jarvis-server)

jarvis-server's `scripts/e2e mobile` runs **every top-level flow here**, one Maestro process
per flow, on its own headless Android emulator against a seeded rich sandbox
(`scripts/seed-dev.py`: Avery Household, its rooms, devices, phonebook, memories, signals
and two nodes). The contract is jarvis-server
`docs/decisions/2026-10-18-e2e-mobile-runner.md`; in short:

- a top-level flow starts with `launchApp: {clearState: true}`, logs itself in through
  `subflows/`, and does not depend on another flow or the order; anything it changes on
  the server it changes back, or it makes its own throwaway data (unique per run);
- a flow that can't run there is tagged `skip` with `properties.skip_reason`;
- the env is `EMAIL`/`PASSWORD` (the superuser), `EMAIL_ADMIN`, `EMAIL_POWER`,
  `EMAIL_MEMBER` (same `PASSWORD`), `CHAT_MESSAGE`/`CHAT_REPLY`, the tool turns
  `TIMER_`/`LIST_`/`DEVICE_MESSAGE` with `_REPLY`/`_REPLY_OFFLINE`, and the seeded inbox's
  `INBOX_*` titles. A flow's own `env:` holds the seed's values, for a local run.

Run one flow from a jarvis-server checkout, against this checkout's committed `HEAD`:

```bash
scripts/e2e mobile --name <sandbox> --mobile-repo <path to this repo> --filter nodes
```

`npm test` checks the flows statically (`__tests__/maestro/flows.test.ts`): the contract
above, that every `runFlow` file exists, that every `id:` names a testID in `src/`, and
that an `inputText` with `${...}` in it is one whole expression, and that no flow
uses `eraseText` except `subflows/clear-field.yaml`.

Android gotchas: the Login screen has no ScrollView, so its button takes a tap with the
keyboard up; on a screen with a ScrollView, `hideKeyboard` (Android's back key) first, and
only right after typing (with no keyboard up it navigates back). An RN `Alert`'s last
button is `android:id/button1`. Maestro drops the space after a `${...}` segment that is
followed by literal text (`"${NAME} E2E"` types `NameE2E`): build the string in one
expression (`evalScript: ${output.x = NAME + ' E2E'}`, then `inputText: ${output.x}`), and
check the field after typing. A react-native-paper `Button`'s label looks folded into the
button's own node (a `childOf` on it found nothing), so match `{id: <button>, text: ...}`.
Scroll to the control you tap (`centerElement: true`), not to its card's title.
To replace a field's text, `runFlow: {file: subflows/clear-field.yaml, env: {FIELD_ID: <testID>}}`
then `inputText`: a plain `tapOn` puts the cursor mid-text and `eraseText` only deletes
before it, so the old tail stays behind the new text.

**Validated end-to-end on a real device (2026-06-23):** the full provisioning
flow ran on an iOS simulator against a live command-center + the fake node — the
app fetched a provisioning token, drove `/info` → `/scan-networks` →
`/provision/k2` → `/provision`, the fake node registered the node with CC, and the
node appeared **Online** in the app's CC-backed Nodes list. Three gotchas the run
surfaced are baked into the flows:
- **Text selectors are full-string regex, not "contains"** — the Nodes tab is
  `"Nodes, tab, N of M"`, so use `text: "Nodes, tab.*"`, not `"Nodes"`.
- **The "Simulator Mode" panel is open by default** on a DEV_MODE build
  (`showDevMode` inits to `EXPO_PUBLIC_DEV_MODE`) — do NOT tap the toggle.
- **`hideKeyboard` is unreliable** on RN Paper inputs, and a live keyboard swallows
  the next button tap (it just dismisses the keyboard instead of pressing). Dismiss
  by tapping an **inert on-screen label** (e.g. "Simulator Mode" / "Connecting to:")
  then `waitForAnimationToEnd` — an appbar-title **point** tap does NOT dismiss it
  (the appbar is outside the scroll view).

**Prerequisites** (build + harness): a `development-e2e` dev-client build
(`EXPO_PUBLIC_DEV_MODE=true` baked — see `eas.json`), the core stack + fake node
up, and config discovery pointed at a CC URL reachable from both the simulator
and the fake-node container (the runner's **host LAN IP**).

Run locally against a booted simulator + a reachable stack:

```bash
maestro test -e EMAIL=ci-node-test@example.com -e PASSWORD=... \
  -e NODE_HOST=127.0.0.1 -e NODE_PORT=8080 \
  .maestro/provisioning-devmode-happy-path.yaml
```

The authoritative "did provisioning work" assertion is **node-online via
command-center**, done by the CI lane *after* this flow — the app's Success
screen reports success even on a node-side error.

**Full runbook (CI lane, topology, shakeout steps):**
`jarvis-integration-tests/docs/mobile-e2e.md`.
