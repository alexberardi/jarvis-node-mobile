# Jarvis Automation — App Store & Google Play listing

Source-of-truth content for App Store Connect and Google Play Console. Most fields have already been pushed via the ASC + Play APIs; this document records what's live and what remains UI-only.

## Pushed-via-API summary (as of 2026-06-12)

**ASC** — Name, subtitle, privacy URL, primary/secondary category, copyright, description, keywords, marketing/promo/support URLs, App Review contact + notes, full Age Rating questionnaire, 8 iPhone screenshots (APP_IPHONE_67), 8 iPad screenshots (APP_IPAD_PRO_3GEN_129).

**Play** — Title, short description, full description, icon (512×512), feature graphic (1024×500), 8 phone screenshots (1500×2868).

**Still UI-only:** ASC App Privacy nutrition labels; Play Data Safety, Content Rating (IARC), App Access, ads/target-audience/news/COVID declarations; ASC encryption export answer (build-bound; set after first build upload); ASC App Store icon (bundled in the next EAS build via `assets/app-store-icon-1024.png`).

---

## 0. Identity (already configured — for reference)

| | Value | Source |
|---|---|---|
| Public name | **Jarvis Automation** | `app.json` `expo.name` |
| iOS bundle ID | `com.jarvis.nodemobile` | `app.json` `ios.bundleIdentifier` |
| Android package | `com.jarvis.nodemobile` | `app.json` `android.package` |
| Version | `1.0.0` | `app.json` `expo.version` |
| iOS build number | `10` | `app.json` `ios.buildNumber` |
| ASC App ID | `6760924901` | `eas.json` `submit.production.ios.ascAppId` |
| EAS project ID | `db3e1a49-edf0-463d-bd7d-0b40d13caf83` | `app.json` `extra.eas.projectId` |
| iOS encryption flag | `ITSAppUsesNonExemptEncryption: false` | Correct — AES-GCM is via OS frameworks (CryptoKit / javax.crypto), and project is open source. Qualifies for export exemption. No annual filing required. |
| iOS Privacy Manifest | `ios/JarvisAutomation/PrivacyInfo.xcprivacy` | Declares no data collection and no tracking — keep aligned with App Privacy answers below. |

---

## 1. App Store Connect

### 1.1 App Information

| Field | Value |
|---|---|
| **Name** (30 chars) | `Jarvis Automation` (17) |
| **Subtitle** (30 chars) | `Voice and home, fully private` (29) |
| **Bundle ID** | `com.jarvis.nodemobile` |
| **SKU** | `jarvis-node-mobile` |
| **Primary language** | English (U.S.) |
| **Primary category** | **Lifestyle** (matches smart-home apps like Govee, LIFX, Hue) |
| **Secondary category** | **Utilities** |
| **Content rights** | Does not contain, show, or access third-party content → **No** (the app talks to the user's own server / their own integrations) |

### 1.2 Pricing and Availability

| Field | Value |
|---|---|
| **Price** | Free |
| **Availability** | All territories — ⚠️ DECIDE if you want to exclude any. Recommended: all available territories. |
| **Pre-orders** | Not applicable |
| **Volume Purchase Program** | Available with discount → No |

### 1.3 App Store Page — Localized Listing (English U.S.)

#### Promotional Text (170 chars — can be edited without a new release)

```
Self-hosted voice assistant for your home. Control devices by voice, design custom routines, and keep every word on your own server. No cloud required.
```
(152 chars)

#### Description (4000 chars)

```
Jarvis Automation is a private, self-hosted voice assistant for your home.

Pair a Raspberry Pi Zero (or any node) once with a QR code, connect your smart devices, and Jarvis listens, responds, and runs your routines — all on hardware you own. No third-party servers, no analytics, no tracking. Your voice, your data, your house.

WHAT YOU CAN DO

• Chat with Jarvis from your phone — handy when speaking out loud isn't an option.
• Provision Pi Zero voice nodes in minutes with QR-code pairing and guided Wi-Fi setup.
• Control lights, locks, plugs, thermostats, cameras, and speakers across Home Assistant, Hue, LIFX, Govee, Kasa, Nest, Schlage, SimpliSafe, Z-Wave, and more.
• Organize devices into rooms (rooms can nest — Upstairs > Bedroom) so Jarvis picks the right device when you say "the bedroom light".
• Design routines that trigger by voice or run quietly in the background, then drop alerts into your inbox.
• Browse the Pantry — an open package store of voice commands, background tasks, and integrations. Install on whichever nodes you choose.
• Enroll your voice profile so Jarvis recognizes which household member is speaking.
• Invite family members to a shared household with admin / power-user / member roles.

PRIVATE BY DESIGN

• Self-hosted by default. Voice recordings, transcripts, and commands stay on the server you run.
• Per-node secrets (API keys, OAuth tokens) are encrypted with AES-256 using a key that never leaves your phone.
• No analytics, advertising, crash reporting, or tracking SDKs in the app — ever.
• Push notifications are optional and can be disabled for a fully on-network experience.
• Open source. Inspect the code, fork it, run it yourself.

WORKS WITH

Home Assistant, Philips Hue, LIFX, Govee, TP-Link Kasa, Nest, Schlage, SimpliSafe, Z-Wave, Spotify, Pandora, Music Assistant, Google Calendar, Drive, Gmail, OpenWeather, Meteo, and more — all configurable per node.

REQUIREMENTS

Jarvis Automation is the mobile client for a Jarvis backend. You'll need a Jarvis server running on your network (Mac, Linux, Docker, or a hosted instance).

OPEN SOURCE

Jarvis is fully open source. Source, docs, and self-hosting instructions: https://docs.jarvisautomation.dev

QUESTIONS

Email alex@alexberardi.net or open an issue on GitHub.
```

Length check: ~2,180 chars — well under the 4,000 limit. Room to add more later.

#### Keywords (100 chars, comma-separated, no spaces)

```
voice assistant,smart home,home automation,self hosted,private,routines,raspberry pi,iot,assistant
```
(99 chars). App Store keywords are case-insensitive and the singular form generally matches plurals, so "routines" covers "routine," "assistants," etc.

#### Support URL

```
https://docs.jarvisautomation.dev
```
⚠️ DECIDE: confirm this is the public-facing support URL. Alternative: a GitHub Issues URL or `mailto:alex@alexberardi.net`. Apple requires a clickable web URL — `mailto:` is not accepted.

#### Marketing URL (optional)

```
https://docs.jarvisautomation.dev
```

#### Privacy Policy URL (required)

```
https://docs.jarvisautomation.dev/security/privacy-policy/
```

#### Copyright

```
© 2026 Jarvis Automation
```

#### Version (matches binary)

`1.0.0`

#### What's New in this Version (only on updates — leave default for first submission)

```
First public release.
```

### 1.4 App Review Information

| Field | Value |
|---|---|
| **Sign-in required** | Yes |
| **Demo Account — Username** | `demo@jarvisautomation.io` |
| **Demo Account — Password** | `Demo1234` |
| **Contact First Name** | Alex |
| **Contact Last Name** | Berardi |
| **Phone Number** | +1 908-278-1811 |
| **Email** | alex@alexberardi.net |
| **Notes** | (paste the block below) |
| **Attachments** | Optional. If review fails, attach a short screen recording of the demo flow. |

> The demo account is required because sign-in needs a non-default step: the reviewer must first point the app at the hosted demo backend via the "Set server URL" control. The notes spell this out; the credentials are also in the dedicated demo-account fields above.

**Reviewer notes — paste verbatim:**

```
Jarvis Automation is the mobile client for a self-hosted home voice assistant. It pairs Raspberry Pi voice nodes, controls smart-home devices, and provides a chat-style interface to a backend running on the user's own server.

Sign-in for review:
1. Launch the app — you'll see the landing screen ("Jarvis").
2. Tap the server icon in the top-right corner (labeled "Set server URL").
3. In the "Server URL" dialog, enter https://config.jarvisautomation.io and tap Save.
4. Tap "Log In" and sign in with:
   Email: demo@jarvisautomation.io
   Password: Demo1234
5. The Home tab opens an in-app chat with Jarvis. The Devices, Routines, Nodes, and Pantry tabs show data from this hosted demo backend.

Setting the server URL points the app at our hosted demo Jarvis backend so the rest of the app can be exercised without a physical Pi node. The full provisioning flow requires a physical Pi Zero voice node and is not testable in the simulator, but the rest of the app (chat, browsing routines, browsing devices, browsing the Pantry package store, settings, household management) is fully exercisable with the demo account above.

Camera permission: only used to scan QR codes during node pairing.
Microphone permission: used to capture speech for the in-app voice chat. Audio is sent to the user's own Jarvis server for transcription via Whisper and is not transmitted to Jarvis Automation infrastructure.
Local network permission: used to auto-discover the Jarvis server on the user's Wi-Fi.

No analytics, advertising, or tracking SDKs.
Open source: https://docs.jarvisautomation.dev

Support: alex@alexberardi.net
```

### 1.5 Encryption / Export Compliance

| Field | Answer |
|---|---|
| **Does your app use encryption?** | Yes |
| **Does the encryption qualify for an exemption?** | Yes — uses only standard, OS-provided encryption (AES-GCM via Apple CryptoKit on iOS, javax.crypto on Android) AND the source code is publicly available (open source). Qualifies under 15 CFR §740.17(b) self-classification and the TSU exemption for publicly available encryption source code. |
| **Annual self-classification filing** | Not required given the publicly-available source exemption. |

Because we answer "yes" to qualifies-for-exemption, **keep** `ITSAppUsesNonExemptEncryption: false` in `app.json`. No yearly BIS filing.

### 1.6 Age Rating Questionnaire — Answers

For all questions below, the answer is **None** unless noted:

- Cartoon or Fantasy Violence — None
- Realistic Violence — None
- Prolonged Graphic or Sadistic Realistic Violence — None
- Profanity or Crude Humor — None
- Mature/Suggestive Themes — None
- Horror/Fear Themes — None
- Medical/Treatment Information — None
- Alcohol, Tobacco, or Drug Use or References — None
- Simulated Gambling — None
- Sexual Content or Nudity — None
- Graphic Sexual Content and Nudity — None
- Contests — None
- Unrestricted Web Access — **No** (the app only communicates with the user's configured Jarvis server and a small set of explicitly-named endpoints; it does not embed a general-purpose browser)
- Gambling and Contests — None

**Resulting rating: 4+**

### 1.7 App Privacy ("Nutrition Labels")

Aligned with `PrivacyInfo.xcprivacy` and the actual code paths:

| Section | Answer |
|---|---|
| **Are you collecting data?** | Yes (account email + user ID, sent to whichever Jarvis server the user configures — including our optional Pantry cloud if the user uses it) |
| **Are you using third-party partners that collect data?** | No |
| **Tracking** (used to track across other apps/websites) | **No** |

**Data Types collected (declare these):**

1. **Contact Info → Email Address**
   - Linked to user identity: **Yes**
   - Used for tracking: **No**
   - Purposes: **App Functionality** (account login)

2. **Identifiers → User ID**
   - Linked to user identity: **Yes**
   - Used for tracking: **No**
   - Purposes: **App Functionality** (authenticated API calls)

**Data Types NOT collected** (uncheck everything else, but specifically these often trip people up):

- Audio Data — **Not collected** (voice goes to the user's own server, not to us)
- Photos or Videos — **Not collected** (camera used only for in-the-moment QR parsing; never stored or transmitted)
- Crash Data, Performance Data, Other Diagnostic Data — **Not collected** (no analytics/crash SDK)
- Coarse/Precise Location — **Not collected**
- Browsing History, Search History — **Not collected**
- Contacts — **Not collected**
- Financial Info — **Not collected**

> Apple's policy: data sent to "your own infrastructure" still has to be declared. But data sent to the **user's** infrastructure (which they own) is not "collection by your app." We only declare the Pantry case + login email because both can flow to *our* Pantry cloud service when the user opts in to it.

### 1.8 Screenshots & Media

**iPhone 6.9" Display (1320×2868)** — required for new submissions. We have these ready in `screenshots/output/`:

Recommended set (in this order, 8 of 10 max):

| # | File | Caption suggestion |
|---|---|---|
| 1 | `home.png` or `home-chat-response.png` | "Chat with Jarvis — quietly" |
| 2 | `routines.png` | "Build routines, run by voice or schedule" |
| 3 | `devices.png` | "All your smart-home gear, one app" |
| 4 | `nodes.png` | "Pair voice nodes in minutes" |
| 5 | `nav-pantry.png` | "Install commands from the Pantry" |
| 6 | `inbox.png` | "Inbox: alerts, reminders, model updates" |
| 7 | `settings-household.png` | "Share your household with the family" |
| 8 | `auth-landing.png` | "Self-hosted by design" |

**iPad 13" Display (2064×2752)** — required because `app.json` has `supportsTablet: true`. ⚠️ **GAP: no iPad screenshots exist.** Either capture on iPad simulator or set `supportsTablet: false` and rebuild. Recommend the former.

**App Preview Videos** — optional. Skip for first submission.

### 1.9 App Store Icon

⚠️ **GAP: current `assets/icon.png` is 432×432.** Apple requires a 1024×1024 PNG (no transparency, no rounded corners — Apple applies the mask). Either:
- Render a new 1024 from the source vector, OR
- Run `assets/icon.png` through an upscaler if no vector exists.

---

## 2. Google Play Console

### 2.1 Store Settings

| Field | Value |
|---|---|
| **App or game** | App |
| **Free or paid** | Free |
| **Default language** | English (United States) — `en-US` |
| **App name** | `Jarvis Automation` (30 char limit, ours is 17) |
| **Category** | **House & Home** (best fit) — alt: Lifestyle |
| **Tags** | Smart home, Home automation, Voice assistant (Play allows up to 5 tags; pick whatever the picker offers closest to these) |
| **Store listing contact — Email** | alex@alexberardi.net |
| **Store listing contact — Phone** | +1 908-278-1811 |
| **Store listing contact — Website** | https://docs.jarvisautomation.dev |
| **External marketing** | ⚠️ DECIDE if you allow Google to promote the app outside Play (default: yes) |

### 2.2 Main Store Listing

#### App name (30 chars)

```
Jarvis Automation
```

#### Short description (80 chars)

```
Private, self-hosted voice assistant for your smart home and Pi voice nodes.
```
(77 chars)

#### Full description (4000 chars)

Use the same description as App Store §1.3 above. Play allows the same length and accepts the same content.

### 2.3 Graphic Assets

| Asset | Required size | Status |
|---|---|---|
| **App icon** | 512×512 PNG, 32-bit RGBA | ✅ `assets/play-store-icon-512.png` exists |
| **Feature graphic** | 1024×500 PNG/JPG (no transparency) | ✅ `assets/feature-graphic.png` exists |
| **Phone screenshots** | 2–8 images, 320–3840px per side, **min/max side ratio ≥ 0.5** | ⚠️ **GAP** — see below |
| **7" tablet screenshots** | Optional, 1024×600 min | Skip for v1 |
| **10" tablet screenshots** | Optional, 1024×600 min | Skip for v1 |
| **Promo video (YouTube)** | Optional | Skip |

⚠️ **Screenshot aspect ratio gap.** The existing 1320×2868 screenshots have an aspect ratio of 0.46 (1320 ÷ 2868), which is below Play's 0.5 minimum. Options to fix:

1. **Pad** each PNG vertically to a maximum 2640px tall (or pad horizontally to a wider canvas) so min/max ≥ 0.5. Easiest: composite each screenshot onto a 1320×2640 background (crop 228px) or 1500×2868 (pad sides). A quick `sips`/ImageMagick script over the 8 chosen screenshots will do it.
2. **Re-capture** on an Android emulator (e.g., Pixel 8 Pro at 1080×2400, aspect 0.45 — still too tall, so this doesn't fully fix it without padding).
3. **Use device frames** (Play allows promo frames around screenshots). Render each in a frame to land at a valid aspect.

Same 8 screenshots from §1.8 work — just need the aspect fix.

### 2.4 Categorization, Tags, Contact Details, Privacy Policy

| Field | Value |
|---|---|
| **App category** | House & Home |
| **Tags** | Smart home, Home control, Voice |
| **Email** | alex@alexberardi.net |
| **Phone** | +1 908-278-1811 |
| **Website** | https://docs.jarvisautomation.dev |
| **Privacy Policy** | https://docs.jarvisautomation.dev/security/privacy-policy/ |

### 2.5 App Content — Required Declarations

#### Privacy policy
URL as above.

#### Ads
**Does your app contain ads?** **No**

#### App access
**Is all functionality available without restrictions?** **No — login required**

Provide reviewer access. Add an instruction with these fields (Play Console → App content → App access → "All or some functionality is restricted"):

| Field | Value |
|---|---|
| **Name** | Demo login |
| **Username** | `demo@jarvisautomation.io` |
| **Password** | `Demo1234` |
| **Any other instructions** | (paste the block below) |

```
Sign-in is required. To reach the hosted demo backend:

1. Launch the app — you'll see the landing screen ("Jarvis").
2. Tap the server icon in the top-right corner (labeled "Set server URL").
3. In the "Server URL" dialog, enter https://config.jarvisautomation.io and tap Save.
4. Tap "Log In" and sign in with the username and password provided above.

This points the app at our hosted demo backend. The Home, Devices, Routines, Nodes, Pantry, and Settings tabs are all exercisable without a physical Pi node. The Provisioning flow requires a real Pi Zero and is not testable on an emulator.

Camera: QR scanning during node pairing.
Microphone: speech capture for the in-app voice chat; audio is sent to the user's own Jarvis server for Whisper transcription.
Local network: server auto-discovery.

No analytics or tracking. Open source: https://docs.jarvisautomation.dev
```

> **Note:** Google Play has no Developer API field for App Access — this block is **UI-only** and must be entered in Play Console by hand. `push_play.py` only pushes listing text. The canonical copy lives in `scripts/store/_content.py` as `PLAY_APP_ACCESS_INSTRUCTIONS`.

#### Content rating
Open the **IARC** questionnaire and answer the same as §1.6:
- Violence/Blood: None
- Sex/Nudity: None
- Profanity: None
- Drugs/Alcohol/Tobacco: None
- Gambling: None
- Crude humor: None
- Fear: None
- Discrimination: None
- Other interactive elements: ⚠️ **YES** for "Users interact" (chat with other household members is possible via shared routines/inboxes); ⚠️ **YES** for "Shares location" only if you ever send precise location, which we don't — answer **NO**; **YES** for "Personal info shared with users" only if applicable — for this app, **NO**.

Expected rating: **Everyone** / PEGI 3 / USK 0.

#### Target audience and content
- **Target age group**: 18+
- Does your app appeal to children? **No**
- Does it have ads in any ad networks intended for children under 13? **No**
- Adheres to Families Policy: N/A

#### News app
**Is your app a news app?** **No**

#### COVID-19 contact tracing
**Is your app a COVID-19 contact tracing or status app?** **No**

#### Data safety form — answers

**Does your app collect or share any of the required user data types?** **Yes** (limited)

Declare:

1. **Personal info → Email address**
   - Collected: Yes
   - Shared: No
   - Optional/Required: Required
   - Purpose: Account management
   - Processed ephemerally? No
   - Collected from users? Yes

2. **App activity → App interactions**
   - Collected: No (no analytics)

3. **App info and performance → Crash logs / Diagnostics**
   - Collected: No

4. **Device or other IDs**
   - Collected: No (we don't read ad IDs or device IDs)

**Security practices:**
- Data is encrypted in transit: **Yes** (TLS to all endpoints)
- Users can request data deletion: **Yes** — via email to alex@alexberardi.net
- Independent security review: **No**
- Commits to Play Families Policy: N/A (not for children)

#### Government app
**Is this a government app?** **No**

#### Financial features
**Does your app provide a financial product or service?** **No**

#### Health app
**Is your app a health app?** **No**

### 2.6 App Releases

| Track | Notes |
|---|---|
| **Internal testing** | Recommended for first upload. Up to 100 testers. Builds are available in minutes. |
| **Closed testing** | For broader beta. |
| **Open testing** | Public beta. |
| **Production** | After internal QA passes. |

⚠️ DECIDE: I'd recommend Internal → Closed (small beta) → Production. EAS `eas.json` already targets `track: internal` in `submit.production.android`.

### 2.7 Permissions and APIs justification (Play prompts)

Pre-write these so they're ready when Play asks:

| Permission | Justification |
|---|---|
| `CAMERA` | Scanning QR codes during voice-node pairing. Not used for any other purpose. |
| `RECORD_AUDIO` | Capturing speech for the in-app voice chat. Audio is streamed to the user's own Jarvis server for transcription via the Whisper STT service. The app does not transmit audio to any other destination. |
| `CHANGE_WIFI_MULTICAST_STATE` / `ACCESS_WIFI_STATE` | Discovering the Jarvis configuration service on the local network via mDNS/Bonjour. |
| `INTERNET` | Communicating with the user's Jarvis server. |
| `POST_NOTIFICATIONS` | Delivering optional push notifications from the user's server (e.g., routine completions, household alerts). User can disable in Settings. |


---

## 3. Assets — gaps and what to do

| Gap | What's needed | How |
|---|---|---|
| **App Store icon 1024×1024** | Current `assets/icon.png` is 432×432; Apple wants 1024 | Render from source vector; if no vector, upscale (e.g., `sips -z 1024 1024`) — though Apple is picky about quality, prefer re-render |
| **iPad screenshots (2064×2752)** | None exist; required because `supportsTablet: true` | Run the existing Maestro flows against the iPad Pro 13" simulator and capture, OR flip `supportsTablet` to false and rebuild |
| **Play Store phone screenshots** | Existing 1320×2868 fails Play's 0.5 aspect ratio min | Pad to 1320×2640 (crop 228px from top or bottom) or to 1500×2868 (add 90px bars left/right). Script suggestion below. |
| **Privacy Policy URL live** | `jarvis-docs/docs/security/privacy-policy.md` exists locally; verify it's deployed and the URL renders | `curl -I https://docs.jarvisautomation.dev/security/privacy-policy/` |

### Quick script to fix Play screenshots

```bash
# Pad to 1320x2640 by cropping 228 pixels off the bottom (Maestro footer is least informative)
cd /Users/alexanderberardi/jarvis/jarvis-node-mobile/screenshots/output
mkdir -p ../play
for f in home.png routines.png devices.png nodes.png nav-pantry.png inbox.png settings-household.png auth-landing.png; do
  sips --cropToHeightWidth 2640 1320 "$f" --out "../play/${f%.png}-play.png"
done
```

Verify: `sips -g pixelHeight -g pixelWidth ../play/*.png` should all show 2640 × 1320 (aspect 0.5).

---

## 4. Outstanding action items

1. **Confirm the demo account works** — the reviewer notes (ASC §1.4, Play §2.5) tell App Review and Play to point the app at `https://config.jarvisautomation.io` and log in as `demo@jarvisautomation.io` / `Demo1234`. Before submitting, verify that account exists on that backend, that the backend is reachable over the public internet from Apple's/Google's network, and that the demo login lands on populated Home/Devices/Routines/Nodes/Pantry tabs (a reviewer hitting an empty or unreachable backend is a fast rejection).
2. **Generate 1024×1024 App Store icon** — see §3.
3. **Capture iPad screenshots** at 2064×2752 — see §3.
4. **Pad Play Store phone screenshots** to fix the 0.46 aspect — see §3.

Everything else is filled.

---

## 5. Submission order — recommended

1. Generate 1024 icon.
2. Capture iPad screenshots.
3. Pad iPhone screenshots for Play.
4. Verify privacy policy URL.
5. Provision the demo account.
6. Paste all fields above into ASC and Play Console.
7. ASC: submit for review with notes block from §1.4.
8. Play: Internal testing release first; promote to Production once you've smoke-tested.

---

## 6. Push scripts

Located at `scripts/store/`. Edit `_content.py` to update copy and re-run; both stores will pick up the changes.

| Script | What it pushes |
|---|---|
| `prepare_assets.py` | Regenerates the 1024 icon + iPad / Play-phone / Play-7" derivative screenshots. Idempotent — safe to re-run after recapturing any `screenshots/output/*.png`. |
| `push_asc.py` | All ASC text fields (name, subtitle, description, keywords, URLs, copyright, review contact + notes) plus the full Age Rating questionnaire. |
| `push_asc_screenshots.py` | iPhone (`APP_IPHONE_67`, raw 1320×2868) and iPad (`APP_IPAD_PRO_3GEN_129`, 2048×2732). Multi-step reserve → upload → commit per screenshot. |
| `push_play.py` | Play listing text (title, short + full description). |
| `push_play_images.py` | Play icon (512), feature graphic (1024×500), phone (1500×2868), 7" tablet (1200×1920), 10" tablet (2048×2732). |

All push scripts default to **dry-run** and require `--apply` to actually push.

**Credentials** (env-var overrides, defaults shown):

```
JARVIS_ASC_KEY_PATH    ~/Downloads/AuthKey_3BN4298AK5.p8
JARVIS_ASC_KEY_ID      3BN4298AK5
JARVIS_ASC_ISSUER_ID   69a6de97-6aaf-47e3-e053-5b8c7c11a4d1
JARVIS_PLAY_SA_PATH    ~/Downloads/google-service-account.json
```

**Dependencies:** `pip install pyjwt cryptography google-auth google-api-python-client requests pillow`

**Typical release flow:**

```bash
cd jarvis-node-mobile/scripts/store
python3 prepare_assets.py              # if screenshots or source icon changed
python3 push_asc.py --apply            # ASC text + age rating
python3 push_asc_screenshots.py --apply
python3 push_play.py --apply           # Play text
python3 push_play_images.py --apply    # Play images
```

**Still UI-only** (no API):
- ASC App Privacy nutrition labels — paste from §1.7
- Play Data Safety, Content Rating (IARC), App Access, ads/audience/news declarations — §2.4–2.5
- ASC encryption export answer — set per-build after first EAS upload
