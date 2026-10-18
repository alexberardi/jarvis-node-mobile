# Maestro e2e flows (L2 — device e2e)

The top layer of the mobile testing pyramid (`prds/mobile-app-delivery.md` Phase 2).
Two lanes play these flows: the regression suite on an Android emulator against a
seeded sandbox (below), and the provisioning lane, which drives a **real
dev-client build** in an iOS simulator against the dockerized **fake node**
(`jarvis-node-setup` `run_provisioning.py` + SimulatedWiFi).

## The regression suite: `scripts/e2e mobile` (jarvis-server)

jarvis-server's `scripts/e2e mobile` plays every **top-level** `*.yaml` here on its
headless harness emulator (Android, release APK, `EXPO_PUBLIC_DEV_MODE=true`)
against a rich-seeded sandbox and the scripted model. Subflows live in
`subflows/` and never run alone. A flow tagged `skip` is reported as skipped with
its `properties.skip_reason`. Layout, skip tags and the seed contract:
[`../docs/decisions/2026-10-18-e2e-mobile-flows.md`](../docs/decisions/2026-10-18-e2e-mobile-flows.md).

| Flow | Proves |
|---|---|
| `auth-roles.yaml` | every seeded role (superuser, admin, power user, member) logs in, and Settings shows the seeded household with that role; a member gets no household edit button |
| `auth-logout.yaml` | Log Out lands on Landing, and a relaunch stays logged out |
| `nav-tabs.yaml` | the five tabs open, and Devices, Routines and Nodes show seeded data |
| `home-chat.yaml` | a chat message gets the scripted model's exact reply (`CHAT_MESSAGE` → `CHAT_REPLY`) |
| `settings.yaml` | a Settings change (auto-play) survives a relaunch |
| `schedules.yaml` | the Scheduled errands screen opens from Routines |
| `provisioning-devmode-happy-path.yaml` (skip) | DEV_MODE "Simulator Mode" → connect to the fake node → NodeInfo → SelectNetwork → EnterPassword → provision → Success |
| `k2-crypto-roundtrip.yaml` (skip) | the REAL `jarvis-crypto` native module (Argon2id + AES-GCM) on **both encrypt and decrypt** — password-protected backup → clipboard → import. jest mocks the module; this is the only test that runs it. **It caught a real native crash on its first run** (an 8-byte stack overflow in `argon2.c`, SIGABRT on every Argon2id hash). |
| `biometric-login.yaml` (skip) | the biometric enroll checkbox (needs Face ID / Touch ID enrolled) |
| `subflows/login.yaml` | shared: Landing → Log In → email/password → the main tabs (`EMAIL`/`PASSWORD` from the parent's env) |
| `subflows/logout.yaml` | shared: Home → Settings → Log Out → Landing |

Pick tabs by id (`tab-home`, `tab-devices`, `tab-pantry`, `tab-routines`,
`tab-nodes`), not by their accessibility text, which differs by platform.

## The provisioning lane (iOS simulator, fake node)

**Validated end-to-end on a real device (2026-06-23):** the full provisioning
flow ran on an iOS simulator against a live command-center + the fake node — the
app fetched a provisioning token, drove `/info` → `/scan-networks` →
`/provision/k2` → `/provision`, the fake node registered the node with CC, and the
node appeared **Online** in the app's CC-backed Nodes list. Three gotchas the run
surfaced are baked into the flows:
- **Text selectors are full-string regex, not "contains"** — the Nodes tab is
  `"Nodes, tab, N of M"`, so use `text: "Nodes, tab.*"`, not `"Nodes"` (or, in
  new flows, `id: "tab-nodes"`).
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
