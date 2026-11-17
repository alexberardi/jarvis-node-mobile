# Mobile IA redesign (A+B)

Status: draft spec, 2026-11-17. Mockups: the "A + B" board on the *Mobile IA redesign* canvas.

## Why

Today most of the app's configuration sits behind two gears:

- **The chat gear (Settings modal)** mixes ten unrelated cards: your account, household switching, voice, appearance, chat, security, privacy, connection, smart home and the server URL.
- **Household settings** are a pencil icon inside that modal, so they are two levels deep. The household editor is one long scroll of fourteen cards. Members sit near the bottom, and Automations is only reachable from there.
- **A node** is split across two screens with eight tabs between them (Detail: Overview / Hardware / Packages / Activity; the gear: Commands / Tasks / Services / Data).
- **Credentials** (the per-node Services secrets) can only be found node by node. Copying them to other nodes is a two-step "Sync to other nodes" modal.

Goal: every screen and control that exists today keeps a home. Each one is reachable in at most two taps from a tab, and grouped by *whose* it is: me, this home, a node, or the Pantry.

Decisions already made (in review of the mockups):

- Use tabs B's Household tab, not A's "split the gear" alone.
- Pantry stays a top-level tab and sits in the center (the package hub).
- Say "Packages", not "Skills". Say "Credentials", not "Accounts".
- Pantry has no "Installed" tab, because packages are per node. Installed state appears in the node picker and on each node.
- Household has a **Jarvis** area for personality and capabilities.
- The node screen is one screen of icon cards, in the same style as Household.
- Credentials stay stored per node. The hub only aggregates them in the app, so no server change is needed.

## Navigation map

```
Tabs:  Chat · Devices · [Pantry] · Routines · Household
       (Nodes tab is removed; nodes live under Household)

Chat header:  (You avatar)  Jarvis / <node ▾>   [?] [new chat] [bell+badge]
Household header: <Home ▾ switcher>                         (You avatar)
```

Root routes after the change:

| Route | Kind | Notes |
|---|---|---|
| `Main` (tabs) | root | Chat, Devices, Pantry, Routines, Household |
| `You` | modal | Replaces `Settings`. Opened from the avatar on Chat and Household. |
| `Inbox` stack | modal | Unchanged |
| `NowPlaying` | modal | Unchanged |
| `SmartHomeSetup` stack | modal | Unchanged. Gains an entry from Household → Smart home. |
| `VoiceProfile`, `RecentCommands`, `Memories`, `Phonebook`, `CallContext`, `CommandData` | push/modal | Unchanged screens, new entry points (see coverage) |
| `Settings`, `HouseholdEdit` | **removed** | Their content is split into You and the Household tab screens |

Household tab stack: `HouseholdHome`, `Members`, `Jarvis`, `Knowledge`, `Credentials`, `CredentialDetail`, `NodeList`, `Node` (card screen), the node sub-screens, `AddNode` (provisioning), `AddComputer`, `ImportKey`, `IntegrationAuth`, `FastPathInspect`, `NodeForgeTest`, `HomeDetails`, `Presence`, `SmartHome`, `PhoneCalls`.

Routines tab stack: `RoutineList` with a top segment **Routines · Scheduled · When things happen**, plus `RoutineEdit`.

## Screens

Each item is tagged with its source today: `S` = SettingsScreen, `H` = HouseholdEditScreen, `ND` = NodeDetailScreen, `NS` = NodeSettingsScreen. All components are reused as they are unless the item says otherwise.

### 1. Chat (Home tab)

The screen stays the same except for the header:

- The **avatar** on the left opens You. It replaces the gear (`HomeScreen` cog).
- The `?` help (re-shows the first-run card) stays.
- New chat and the bell with its unread badge stay.
- The node selector, warm-up/tools modal, quick actions, empty states ("Add Your First Node" → Household › Nodes › Add node), attachments, mic, TTS, deep-link quick-open and the MiniPlayer are all unchanged.

### 2. You (modal, replaces Settings)

The account-level and this-phone settings, in this order:

1. **Profile**: display name editor (S Account).
2. **My voice**:
   - Voice profile → `VoiceProfile` (S Voice)
   - Command feedback → `RecentCommands` (S Voice)
   - Call details → `CallContext` (S Voice; per user)
3. **Chat channels**: `ChannelsCard`, which handles per-member Discord/Slack linking (S). It keeps its hidden-when-empty rule.
4. **This phone**:
   - Appearance: Light / Dark / System (S)
   - Auto-play responses (S Chat)
   - Biometric login, on capable devices only (S Security)
   - Push notifications (S Privacy)
5. **Connection**: status chip, the resolved URLs, Re-check, and the config service URL with Save & Connect / Clear. Both still log out (S Connection + Config Service URL). This collapses to one row that pushes a sub-screen.
6. **Log out**, then **Delete account** (dialog unchanged) (S Account).
7. Footer: app version.

### 3. Household tab: home screen

- **Header**:
  - `Home ▾` opens the household switcher sheet, which holds every household with its role and a radio. Today this is the radio list in S Household.
  - The sheet also has **Join with invite code** and **Create household** (S Household). Validation and alerts are unchanged.
  - The avatar opens You.
- **Members row**: up to five avatars with a count. Tapping it opens Members. **Invite** is a shortcut to the Create Invite dialog and is shown only to admins and power users.
- **Tiles**, 2×2, with status lines:
  - **Jarvis**: Personality, capabilities
  - **Nodes**: "4 online"
  - **Credentials**: "1 to fix" in amber when any node has a required credential unset
  - **Knowledge**: memories count
- **This home** list:
  - Name, Location & time zone → `HomeDetails`
  - Presence → `Presence`
  - Smart home → `SmartHome`
  - Phone calls → `PhoneCalls`

### 4. Members (Household)

This screen gathers the current H Members, H Invite Codes and H Danger Zone sections, with their role gates unchanged:

- Member rows with a role chip. Admins get a role menu and Remove.
- Invite codes, for admins and power users only: list, Create dialog (role, expiry, max uses), Revoke.
- **Leave household**, only when the user belongs to more than one household. It keeps the last-member deletion warning.
- Pull to refresh and Retry.

### 5. Jarvis (Household)

- **Personality**: preset chips, the persona text box with its counter, and Save (H Voice). The heading is renamed from "Voice" because it describes how Jarvis talks, not audio.
- **Capabilities**, each shown only when the server returns its key:
  - Use web search (H)
  - Use the Pantry (H)
  - Use watches (H)
  - Let rules run errands without asking (H)
- Admin-only writes. Non-admins see read-only controls with the "Only a household admin can change this." note.
- The mockup's "Speaking voice" row is **dropped**. No TTS voice setting exists today; add it only when the server has one.

### 6. Knowledge (Household)

- **Memory switches**: Use memory, and Learn from voice (H Memory). Admin only.
- **Memories list**: today's `MemoriesListScreen`, embedded or pushed. It keeps the My Memories / Household sections, swipe to forget, the + button, and the editor (scope, pin, category).
- Fix the copy: "Learn from voice" mentions a Speaker recognition toggle that the app does not have. Point to the admin UI as `help.ts` already does.

### 7. Nodes list (Household › Nodes)

- This is today's `NodeListScreen` unchanged: cards, pull to refresh, empty and error states.
- Header: **Import key** (to `ImportKey`).
- Two buttons: **Add node** (provisioning flow, unchanged) and **Add a computer**.

### 8. Node (card screen; replaces NodeDetail + NodeSettings)

- **Status card**:
  - online state and last seen
  - kind (Pi, or computer agent)
  - the "speaks as" line for computers
  - uptime, command count and routine count (ND Overview)
  - **Version / updates**, from `NodeUpdateSection` unchanged: Enable updates, Update, the Remote updates switch, the busy note, the active task with Cancel, and the agent-version text for computers
- **Key banner**:
  - When this phone has no K2 for the node (`needs_k2`): "Encryption key required" with **Generate key**, from NS.
  - Any card that depends on the snapshot shows a "needs key" state until then.
- **What it can do** (2×2 cards):
  - **Packages** → Node packages. This merges ND Packages and NS Commands. Per package:
    - enable switch
    - "from" line, config error badge, and the store it came from
    - "Share with phone calls" when the package declares call context
    - ⋮ menu: Uninstall, Inspect fast-paths (→ `FastPathInspect`), Setup help, Open in Pantry (→ StoreDetail, which offers Update/Revert)
  - **Credentials** → the Credentials hub, filtered to this node. The card status reads like "Gmail needs sign-in".
  - **Background tasks** → today's NS Tasks list: always running / interval, needs-setup, auto-disabled reason, switch, and the agent's secrets with "Configured in {service}" for inherited ones.
  - **Stored data** → `DataBrowserHome {nodeId}`, which is reachable again (see Removed). It keeps its error, read-only and empty states.
- **Device** (2×2 cards, Pi only unless noted):
  - **Wake word & mic** → `NodeVoiceSettings` unchanged.
  - **Speaker & Bluetooth** → `BluetoothSection` + `SpeakerHATCard` (the HAT card only when one is detected).
  - **Hardware & maintenance** → Device info (voice mode, platform, Python, adapter, node ID with copy) + `NodeMaintenanceSettings` + the Voice recognition card (→ `VoiceProfile`). This card is hidden for docker installs, as the Hardware tab is today.
  - **Room & name** is **new**. Today there is no member-facing way to rename a node or change its room after setup. The server only has `PATCH /admin/nodes/{id}` (system admin, room only). It needs a household-admin route first; until then, leave the card out.
- **⋮ menu**:
  - Test a Forge command (→ `NodeForgeTest`)
  - Scan for devices with this node (→ SmartHomeSetup › DeviceDiscovery, from NS Services)
  - Export encryption key (K2 backup modal, from NS Services)
  - **Delete node** for Pis, or **Sign out this computer** for computers. This is the whole ND Danger Zone modal flow, unchanged, with the same `canDelete` rule.
- **Activity tab is dropped.** It is a placeholder with no data today ("No activity yet"). Bring it back as a card when it has content.

### 9. Credentials (Household tile, and the node card)

This screen aggregates in the app what NS Services shows today, across every node where this phone holds a K2. It requests each node's snapshot (the same flow as today), runs those requests in parallel and shows per-node progress. Nodes without a K2 are listed as "Import key to manage" (→ ImportKey).

- **List**: one row per service or device protocol, sorted with required-and-unset first. Each row has:
  - a status (OK / needs sign-in / required missing)
  - which nodes have it
  - a "Personal" tag when any secret is `scope: user`. Tapping the person icon shows the existing "each member configures their own" snackbar.
- **Credential detail** (the "Sign in to Gmail" mockup):
  - **Node checkboxes** decide which nodes the save goes to. This replaces the Sync-to-other-nodes two-step modal: a save pushes to every checked node through `buildSyncPushes`, which keeps the shared/personal split.
  - Secret rows open `SecretEditDialog` unchanged, including bool/user/enum/int types, Delete, and the "Apply Defaults?" preset prompt.
  - Authenticate with {provider} (→ `IntegrationAuth`) for OAuth, including device-protocol URL placeholders.
  - Setup help (markdown modal).
  - Component switches when a service has more than one component (command / agent / daemon).
  - Uninstall (⋮), for this service on chosen nodes.
- The "{n} required settings not configured" banner becomes the tile's amber "n to fix".
- Text fix from the mockup: the row subtitle says "Used by the Email package", not "skill".

### 10. Home details, Presence, Smart home, Phone calls (Household › This home)

- **HomeDetails**:
  - Name with Save (H Name)
  - Location with Save (H Location)
  - Time zone (`HouseholdTimezoneCard`, hidden without the server key)
  - All admin only
- **Presence**: H Home Presence unchanged and still stored on this phone:
  - presence switch
  - background switch, iOS only
  - arrive/leave notifications
  - current status
  - set/update/remove home location
  - radius slider
  - Label the screen "On this phone" so it is clear that this setting is not household-wide.
- **SmartHome**:
  - Primary node radio list (S Smart Home)
  - Use external devices (S Smart Home)
  - **Connect Home Assistant** → `SmartHomeSetup`. Today that is only reachable after provisioning.
- **PhoneCalls**:
  - `TwilioSettingsCard` (H; admin edits)
  - **Phonebook** → `Phonebook`, moved from S Voice. It holds household businesses, so it belongs with calling.

### 11. Pantry tab

Unchanged except for the update banner:

- the `PantryGate` states
- the help icon
- the **Test** button (→ TestInstall)
- the store picker, search, category chips and sort
- package cards (with the installed/node-count chip, verified, risk and bundle badges)
- StoreDetail, with Install/Update/Revert, the admin/power-user gate, apt and computer filtering, and the store locks
- NodePickerSheet, InstallProgress, TestInstall, and SendToForgeCard

**New:** the top banner "N updates ready". It is built from the per-node installed versions that the browse screen already fetches for its install chip, and it opens StoreDetail for that package. No "Installed" tab.

### 12. Routines tab

- A top segment: **Routines · Scheduled · When things happen**.
  - Routines: today's list and editor, unchanged.
  - Scheduled: `ScheduleListScreen`. Today it is only reachable from a header icon, and it has **no back button**.
  - When things happen: `SignalAutomationsScreen`, moved from H Automations because it holds trigger→action rules, the same kind of thing as routines.
- Keep the `calendar-clock` icon out. The segment replaces it.
- The in-flight `feat/simple-routines` branch touches RoutineEdit only and does not conflict.

### 13. Devices tab, Inbox, Now playing, Auth, Provisioning

These are unchanged, including:

- Rooms and the camera view
- the discovery flow
- every Inbox sub-screen and the suppressed suggestions
- push-tap routing
- deep links
- Landing/Login/Register
- ForcePasswordChange

The one exception: the push `bluetooth_scan` target changes from `NodesTab › NodeDetail {initialTab: 'hardware'}` to `HouseholdTab › Node › Speaker & Bluetooth`.

## Coverage: every current item → new home

Every row in this table was found on `origin/main` (b7e409e). A row marked "dropped" is a deliberate removal.

| Today | New home |
|---|---|
| S Account: display name | You › Profile |
| S Account: Log out, Delete account | You |
| S Household: switch household | Household header switcher |
| S Household: join with code, create household | Household switcher sheet |
| S Household: edit pencil → HouseholdEdit | gone; Household tab is the editor |
| S ChannelsCard | You › Chat channels |
| S Voice: Voice profile | You › My voice (also Node › Hardware) |
| S Voice: Command feedback | You › My voice |
| S Voice: Memories | Household › Knowledge |
| S Voice: Phonebook | Household › Phone calls |
| S Voice: Call details | You › My voice |
| S Appearance, Chat auto-play, Biometric, Push | You › This phone |
| S Connection + Config service URL | You › Connection |
| S Smart Home: primary node, external devices | Household › Smart home |
| S footer version | You footer |
| H Name, Location, Time zone | Household › Home details |
| H Voice (persona) | Household › Jarvis › Personality |
| H Web search, Pantry, Watches, Errands | Household › Jarvis › Capabilities |
| H Memory switches | Household › Knowledge |
| H Twilio | Household › Phone calls |
| H Home Presence | Household › Presence |
| H Automations → SignalAutomations | Routines › When things happen |
| H Members, Invite codes, Leave | Household › Members |
| Nodes tab / NodeList, Import key, Add node, Add computer | Household › Nodes |
| ND header gear | gone; cards replace the second screen |
| ND Overview status/stats/update | Node status card |
| ND Overview Forge test | Node ⋮ |
| ND Overview Danger zone (delete / sign out) | Node ⋮ |
| ND Hardware: Bluetooth, HAT | Node › Speaker & Bluetooth |
| ND Hardware: Device info, Maintenance, Voice recognition | Node › Hardware & maintenance |
| ND Hardware: Voice settings | Node › Wake word & mic |
| ND Packages | Node › Packages |
| ND Activity (placeholder) | **dropped** until it has data |
| NS needs-K2 Generate key | Node key banner |
| NS Commands (switch, uninstall, share with calls) | Node › Packages |
| NS Tasks | Node › Background tasks |
| NS Services groups, secrets, auth, setup help | Credentials (hub + node-filtered) |
| NS Services: Sync to other nodes | Credential detail node checkboxes |
| NS Services: Inspect fast-paths | Node › Packages ⋮ |
| NS Services: Uninstall group | Credential detail ⋮, and Node › Packages ⋮ |
| NS Services: Device protocols | Credentials (as rows) |
| NS Services: Scan for devices | Node ⋮ (also Devices + button) |
| NS Services: Export encryption key | Node ⋮ |
| NS Data | Node › Stored data |
| Store, all screens | Pantry tab, plus the updates banner |
| Routines header → ScheduleList | Routines › Scheduled |
| Home cog | Chat avatar → You |

## Removed or fixed while moving

- `SmartHome/DeviceListScreen`: unreachable on main, and its power button is a "not yet wired" stub. Delete it.
- `SmartHomeSetup`'s `IntegrationAuth` route is never targeted (the Nodes stack copy is the one used). Keep a single route in the Household stack.
- `DataBrowserHome`: unreachable today. It becomes the Stored data target, pinned to the node.
- `RecentCommandsList`/`Detail` and `ScheduleList` have no back control. Add an Appbar back when they move.
- `SignalAutomations` says "admin" in its comment but has no role gate. Keep it ungated, since anyone in the household can write routines today; confirm separately.
- Provisioning "Developer options" is always visible. This is out of scope; note it only.

## Gating carried over unchanged

- **Admin-only writes:**
  - household name, location, time zone
  - persona and capabilities
  - memory switches
  - Twilio
  - member role changes and removal
- **Admin or power user:**
  - invites
  - Pantry install/update/revert
  - the Edit entry, now meaning visibility of the editing controls
- **Admin only:** enable Pantry (PantryGate).
- **More than one household:** Leave.
- **K2 on this phone:**
  - snapshot-backed node cards
  - Pi delete
  - credential targets
- **The member who paired a computer, or an admin:** signing out that computer.
- **Device and platform:**
  - Computers get no Wake word, Bluetooth, HAT or Maintenance cards.
  - Docker installs hide Hardware & maintenance.
  - Only tarball installs show the update controls.
  - Background presence is iOS only.
  - Biometric needs a capable device.
- **Server capability keys:** sections stay hidden when their key is missing (Pantry, watches, errands, time zone, channels).

## Test impact

- Maestro flows that reference the gear or the Nodes tab need new navigation steps. The testIDs on moved controls are **kept as they are**, so only the "how to get there" steps change. Affected flows:
  - `settings.yaml`
  - `auth-roles.yaml`
  - `household-edit.yaml`
  - `household-members.yaml`
  - `household-member-view.yaml`
  - `household-watches-errands.yaml`
  - `nodes.yaml`
  - `call-context.yaml`
  - `biometric-login.yaml`
  - `auth-logout.yaml`
  - `.maestro/COVERAGE.md`
- Jest suites for SettingsScreen, HouseholdEditScreen, NodeDetailScreen and NodeSettingsScreen follow their content into the new screens.

## Rollout (each merge ships to testers; batch per phase)

1. **Household tab + You.** Replace the Nodes tab with Household. Build the Household home, Members, Jarvis, Knowledge, Home details, Presence, Smart home and Phone calls screens out of the existing H/S components. Add the You modal, the avatar, and the switcher sheet. Delete Settings and HouseholdEdit. Pure moves, no API change.
2. **Node card screen.** Merge NodeDetail and NodeSettings into the card screen and its sub-screens. Credentials temporarily opens a node-filtered copy of today's Services list.
3. **Credentials hub.** Multi-node snapshots, the detail screen with node checkboxes, and the tile status.
4. **Routines segments** (Scheduled, When things happen) and the **Pantry updates banner**.
5. **Later, needs server:** node Room & name (household-admin PATCH), Activity, Speaking voice.

## Open questions

1. Does the Inbox bell stay on Chat only, or also on the Household header?
2. Should Knowledge fold into the Jarvis tile (one tile fewer)?
3. Should Phonebook live under Phone calls (household businesses), or in You next to Call details?
4. Should the updates banner stay in Pantry, or should updates show only as node badges?
5. Should "When things happen" automations be admin-only?

## Appendix A: every screen file → stack and entry after the change

This lists every file under `src/screens` on main (b7e409e). "Same" means the stack and entry points are unchanged.

| Screen file | Stack after | Reached from (after) |
|---|---|---|
| Auth/LandingScreen, LoginScreen, RegisterScreen | Auth (same) | signed out |
| Auth/ForcePasswordChangeScreen | root gate (same) | `mustChangePassword` |
| Home/HomeScreen | Chat tab | tab; deep links `stt`/`chat` |
| NowPlaying/NowPlayingScreen | root modal (same) | MiniPlayer |
| Settings/SettingsScreen | **deleted**, becomes `You` + Household screens | — |
| *(new)* YouScreen | root modal | avatar on Chat and Household headers |
| *(new)* ConnectionScreen | You stack | You › Connection |
| Settings/HouseholdEditScreen | **deleted**, split into HouseholdHome / Members / Jarvis / Knowledge / HomeDetails / Presence / SmartHome / PhoneCalls | — |
| *(new)* HouseholdHomeScreen + switcher sheet | Household tab | tab |
| *(new)* MembersScreen, JarvisScreen, KnowledgeScreen, HomeDetailsScreen, PresenceScreen, SmartHomeScreen, PhoneCallsScreen | Household tab | Household home |
| Settings/SignalAutomationsScreen | Routines tab (segment "When things happen") | Routines segment |
| Settings/VoiceProfileScreen | root push (same) | You › My voice; Node › Hardware & maintenance |
| Settings/IntegrationAuthScreen | Household stack (one route; the SmartHomeSetup copy is removed) | Credential detail › Authenticate |
| RecentCommands/RecentCommandsListScreen, RecentCommandDetailScreen | root push (same) + **add an Appbar back** | You › My voice › Command feedback |
| Memories/MemoriesListScreen, MemoriesEditScreen | root modal (same) | Household › Knowledge |
| Phonebook/PhonebookListScreen, PhonebookEditScreen | root modal (same) | Household › Phone calls |
| CallContext/CallContextListScreen, CallContextEditScreen | root modal (same) | You › My voice › Call details |
| ImportKey/ImportKeyScreen | Household stack | Nodes header; Credentials "Import key to manage" |
| Nodes/NodeListScreen | Household stack | Household › Nodes tile |
| Nodes/NodeDetailScreen + NodeSettingsScreen | **merged** into NodeScreen (cards) + sub-screens NodePackages, NodeTasks, NodeVoice, NodeSpeaker, NodeHardware | Nodes list; push `bluetooth_scan` → NodeSpeaker |
| Nodes/HardwareTab | split: Device info + Maintenance + Voice recognition → NodeHardware; Bluetooth + HAT → NodeSpeaker; Voice settings → NodeVoice | Node cards |
| Nodes/AddComputerScreen | Household stack | Nodes list button |
| Nodes/FastPathInspectScreen | Household stack | Node › Packages ⋮ |
| Nodes/NodeForgeTestScreen | Household stack | Node ⋮ |
| Provisioning/ScanForNodes, NodeInfo, SelectNetwork, EnterPassword, ProvisioningProgress, Success | AddNode in Household stack | Nodes list › Add node; Chat empty state "Add Your First Node". Success "Done" returns to Chat (same); "Set Up Smart Home" (same) |
| CommandData/DataBrowserHomeScreen | root push | Node › Stored data (pinned `nodeId`); unreachable today |
| CommandData/RecordsListScreen, RecordDetailScreen, RecordEditScreen | root push (same) | from DataBrowserHome |
| Store/StoreBrowseScreen, StoreDetailScreen, NodePickerSheet, InstallProgressScreen, TestInstallScreen (+ SendToForgeCard) | Pantry tab (same) | tab; node Packages ⋮ "Open in Pantry"; the updates banner |
| Devices/DevicesScreen, DeviceEditScreen, ExternalDeviceDetailScreen, CameraViewScreen, RoomManagementScreen | Devices tab (same) | same |
| SmartHome/DeviceDiscoveryScreen | Devices stack + SmartHomeSetup (same) | Devices +; Node ⋮ Scan for devices; Forge test |
| SmartHome/SmartHomeSetupScreen, HADiscoveryScreen, HAAuthScreen, HADeviceImportScreen, DeviceRoomAssignmentScreen | SmartHomeSetup modal (same) | **new:** Household › Smart home › Connect Home Assistant; provisioning Success (same) |
| SmartHome/DeviceListScreen | **deleted** (unreachable, unwired toggle) | — |
| Routines/RoutineListScreen, RoutineEditScreen | Routines tab (same) | tab |
| Schedules/ScheduleListScreen | Routines tab (segment "Scheduled") | Routines segment; the header icon is removed |
| Inbox/InboxListScreen, InboxDetailScreen, InboxCallbackResultScreen, InteractiveListScreen, WebViewPickerScreen, SuppressedSuggestionsScreen, AdapterProposalScreen, AdapterProposalDetailScreen, AdapterDeployedScreen | Inbox modal (same) | Chat bell; push taps (same routing) |

Shared components are reused unchanged by whichever screen hosts them:

- **Chat:** ChatBubble, QuickActions, NodeSelector, ThinkingWave
- **Help and first run:** FirstRunCard, HelpIcon, HelpProvider
- **Inbox:** the inbox cards, ActionButtons, InteractiveElementsSection
- **Devices:** DeviceControlPanel
- **Routines:** ParameterArgRow
- **Stored data:** FieldEditor
- **Pantry:** PantryStorePicker
- **Node key backup:** K2QRCode / K2BackupCard
- **You › Profile:** DisplayNameEditor
