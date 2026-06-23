# Maestro e2e flows (L2 — device e2e)

The top layer of the mobile testing pyramid (`prds/mobile-app-delivery.md` Phase 2).
These flows drive a **real dev-client build** in an iOS simulator against the
dockerized **fake node** (`jarvis-node-setup` `run_provisioning.py` + SimulatedWiFi)
on the `jarvis-integration-tests` core stack — exercising the production
provisioning code path minus the two phone-side WiFi switches, which no in-app
tool can automate.

| Flow | Proves |
|---|---|
| `provisioning-devmode-happy-path.yaml` | DEV_MODE "Simulator Mode" → connect to the fake node → NodeInfo → SelectNetwork → EnterPassword → provision → Success |
| `login.yaml` | reusable auth subflow (email/password → household) |

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
