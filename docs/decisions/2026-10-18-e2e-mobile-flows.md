# The mobile E2E flows: layout, skip tags and the seed contract

- **Date:** 2026-10-18 (user chose the layout and the split on loop item #145; the rest by
  agent, E2E piece 5/9)

jarvis-server's `scripts/e2e mobile` runs this repo's `.maestro/` flows on its harness
emulator. The runner and its contract are jarvis-server's
`docs/decisions/2026-10-18-e2e-mobile-runner.md`; this file is the flows' side of it.

- **Top-level flows with an area prefix (user).** The runner plays only top-level
  `.maestro/*.yaml`, so the flows sit there, named by screen area: `auth-*`, `nav-*`,
  `home-*`, and later `devices`, `routines`, `inbox`, `recent-commands`, `command-data`.
  No `.maestro/e2e/` directory.
- **The prerequisite came from piece 6 (#118).** It moved `login.yaml` to
  `.maestro/subflows/`, added `login-as.yaml`, and tagged the iOS-era flows `skip`
  (`docs/decisions/2026-10-18-e2e-mobile-flows-settings.md`). This piece builds on that and
  adds `subflows/logout.yaml` (Home → Settings → Log Out → Landing). Another role logs in
  through `subflows/login-as.yaml` with `LOGIN_EMAIL`.
- **Every flow stands alone:** `launchApp: {clearState: true}`, then a login subflow.
- **Select by testID, not by label.** Tabs carry `tabBarButtonTestID`s (`tab-home`,
  `tab-devices`, `tab-pantry`, `tab-routines`, `tab-nodes`): the tab's accessibility text
  ("Home, tab, 1 of 5") is platform-dependent. New testIDs follow the id-suffixed pattern
  (`schedule-card-<id>`) and get a jest check where a component test can reach them.
- **Assert behaviour.** A flow checks that seeded data shows up, that a change persists
  across a relaunch, or that an action had its effect, not only that a screen opened.

## The seed contract

The flows read the rich seed (jarvis-server `scripts/seed-dev.py`) and the scripted model
(`e2e/llm/mobile.json`). What they rely on today:

| flow | relies on |
|---|---|
| `auth-roles` | household "Avery Household"; the superuser, a second admin, a power user and a member, all on `PASSWORD` (`EMAIL`, `EMAIL_ADMIN`, `EMAIL_POWER`, `EMAIL_MEMBER`) |
| `nav-tabs` | the device "Kitchen Ceiling" (local devices, not external), at least one routine, the kitchen node `5eed0000-0000-4000-8000-00000000a0de` |
| `home-chat` | an online node with its tools loaded; `CHAT_MESSAGE` → `CHAT_REPLY` in `mobile.json` |

A seed change that renames or drops one of these breaks the flow on purpose; change both
together.

## Split (user)

#145 lands in three PRs: (1) the starter flows (login per role, logout, the five tabs, a
chat round trip; the subflow move and skip tags already came with #118), (2) home/chat with a tool call, devices, routines and schedules,
(3) inbox, recent commands and the command data browser. PR 2's tool-call step and PR 3
wait on a jarvis-server item that seeds one inbox item of each kind, schedules, and adds
`mobile.json` rules for a timer, a list add and `control_device`. The devices flow's light
toggle step is tagged `skip` until the fake Home Assistant (#154) lands.
