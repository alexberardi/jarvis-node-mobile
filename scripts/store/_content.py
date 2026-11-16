"""Listing copy used by both App Store Connect and Google Play push scripts.

Edit this file to update store listings; both push scripts will pick up the
changes on the next run. Keep `STORE-LISTING.md` aligned with this content.

The demo-account password for store review is read from the
``DEMO_ACCOUNT_PASSWORD`` env var so it is never committed. Export it before
running the review-submission scripts (``push_asc.py``).
"""

import os

# ── Shared across stores ─────────────────────────────────────────────────────
SUBTITLE = "Voice and home, fully private"

PRIVACY_POLICY_URL = "https://docs.jarvisautomation.dev/security/privacy-policy/"
MARKETING_URL = "https://docs.jarvisautomation.dev"
SUPPORT_URL = "https://docs.jarvisautomation.dev"

COPYRIGHT = "© 2026 Jarvis Automation"

KEYWORDS = (
    "voice assistant,smart home,home automation,self hosted,"
    "private,routines,raspberry pi,iot,assistant"
)

PROMOTIONAL_TEXT = (
    "Self-hosted voice assistant for your home. Control devices by voice, "
    "design custom routines, and keep every word on your own server. No cloud required."
)

SHORT_DESCRIPTION = (
    "Private, self-hosted voice assistant for your smart home and Pi voice nodes."
)

DESCRIPTION = """Jarvis Automation is a private, self-hosted voice assistant for your home.

Pair a Raspberry Pi Zero (or any node) once with a QR code, connect your smart devices, and Jarvis listens, responds, and runs your routines — all on hardware you own. No third-party servers, no analytics, no tracking. Your voice, your data, your house.

WHAT YOU CAN DO

• Chat with Jarvis from your phone — handy when speaking out loud isn't an option.
• Link your Discord or Slack account and talk to Jarvis there too, including voice clips.
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

Email help@jarvisautomation.io or open an issue on GitHub."""

# ── App Store Review ─────────────────────────────────────────────────────────
DEMO_CONFIG_URL = "https://config.jarvisautomation.io"
DEMO_ACCOUNT_EMAIL = "demo@jarvisautomation.io"
# Read from env so the live demo credential is never committed. Unrelated
# imports (e.g. SHOTS) still resolve; the review-push scripts that actually
# submit this value require the env var to be set.
DEMO_ACCOUNT_PASSWORD = os.environ.get("DEMO_ACCOUNT_PASSWORD", "")

REVIEW_NOTES = f"""Jarvis Automation is the mobile client for a self-hosted home voice assistant. It pairs Raspberry Pi voice nodes, controls smart-home devices, and provides a chat-style interface to a backend running on the user's own server.

Sign-in for review:
1. Launch the app — you'll see the landing screen ("Jarvis").
2. Tap the server icon in the top-right corner (labeled "Set server URL").
3. In the "Server URL" dialog, enter {DEMO_CONFIG_URL} and tap Save.
4. Tap "Log In" and sign in with:
   Email: {DEMO_ACCOUNT_EMAIL}
   Password: {DEMO_ACCOUNT_PASSWORD}
5. The Home tab opens an in-app chat with Jarvis. The Devices, Routines, Nodes, and Pantry tabs show data from this hosted demo backend.

Setting the server URL points the app at our hosted demo Jarvis backend so the rest of the app can be exercised without a physical Pi node. The full provisioning flow requires a physical Pi Zero voice node and is not testable in the simulator, but the rest of the app (chat, browsing routines, browsing devices, browsing the Pantry package store, settings, household management) is fully exercisable with the demo account above.

Camera permission: only used to scan QR codes during node pairing.
Microphone permission: used to capture speech for the in-app voice chat. Audio is sent to the user's own Jarvis server for transcription via Whisper and is not transmitted to Jarvis Automation infrastructure.
Local network permission: used to auto-discover the Jarvis server on the user's Wi-Fi.

No analytics, advertising, or tracking SDKs.
Open source: https://docs.jarvisautomation.dev

Support: help@jarvisautomation.io"""

REVIEW_CONTACT = {
    "contactFirstName": "Alex",
    "contactLastName": "Berardi",
    "contactEmail": os.environ.get("ASC_CONTACT_EMAIL", "alex@jarvisautomation.io"),
    "contactPhone": os.environ.get("ASC_CONTACT_PHONE", ""),
    "demoAccountRequired": True,
    "demoAccountName": DEMO_ACCOUNT_EMAIL,
    "demoAccountPassword": DEMO_ACCOUNT_PASSWORD,
    "notes": REVIEW_NOTES,
}

# Google Play "App access" instructions (UI-only — no Play Developer API field;
# paste into Play Console → App content → App access). Kept here so ASC and Play
# stay in sync from one source.
PLAY_APP_ACCESS_INSTRUCTIONS = f"""Sign-in is required. To reach the hosted demo backend:

1. Launch the app — you'll see the landing screen ("Jarvis").
2. Tap the server icon in the top-right corner (labeled "Set server URL").
3. In the "Server URL" dialog, enter {DEMO_CONFIG_URL} and tap Save.
4. Tap "Log In" and sign in with the username and password provided above.

This points the app at our hosted demo backend. The Home, Devices, Routines, Nodes, Pantry, and Settings tabs are all exercisable without a physical Pi node. The Provisioning flow requires a real Pi Zero and is not testable on an emulator.

Camera: QR scanning during node pairing.
Microphone: speech capture for the in-app voice chat; audio is sent to the user's own Jarvis server for Whisper transcription.
Local network: server auto-discovery.

No analytics or tracking. Open source: https://docs.jarvisautomation.dev"""

# ── Release notes (What's New) ───────────────────────────────────────────────
# Customer-facing changes from v1.0.4 to v1.0.5 (mobile main since 0b6b3a1, 2026-09-16).
# ASC limit: 4000 chars. Pushed by push_release_notes.py.
WHATS_NEW = """Jarvis now works from your computer and your chat apps, shows what's playing, and does more on its own.

NEW
• Computers as nodes: add a Mac, Windows or Linux computer to your household, approve it from the app, and talk to Jarvis there too.
• Chat channels: link your account on Discord or Slack and talk to Jarvis there, including voice clips. Jarvis shows what it heard and answers in text.
• Now playing: see what every node is playing, with cover art, a seek bar and controls, plus a mini-player above the tabs.
• Photos in chat: attach a picture and ask Jarvis about it, when your server's model can see images.
• Pictures and videos in your Inbox: view them, save them, or share them.
• Things Jarvis did on its own: Inbox cards show what ran in the background and its answer, and watch alerts get their own layout. Household switches decide how much Jarvis may do without asking.
• Simple routines: describe what Jarvis should do in plain words, or switch to the step-by-step editor.
• Phone calls: choose which commands can be used on a call, and set up your household's Twilio number.
• Several Pantry stores: choose which store each package comes from, and see where an installed package came from.
• Household time zone, from the Household screen.

IMPROVED
• Adding a node: the app finds nodes on your network that are ready to set up.
• Bluetooth pairing shows devices as they're found, and you can pair mid-scan. Device scans let you pick the node and cancel.
• A switch or light whose state can't be read now says Unknown instead of guessing.
• Inbox buttons show whether their action worked.
• Node updates compare versions correctly and fetch the node's own release.
• Voice settings explain why they can't load, and show the automatic wake sensitivity.
• Chat has a new look, with a waveform while Jarvis is thinking.
• Setting up: one server address on the landing screen, and a node is never handed an address it can't reach.
• Clearer dark mode, readable chips and consistent page titles throughout.

FIXED
• Voice from Android phones is transcribed correctly.
• You're signed out cleanly after a password reset, and the app recovers its session if it opened while your phone was locked.
• Times from your server always show in your time zone; an offline node never says "Just now".
• The photo picker and the message box behave when the keyboard is open.
• General stability improvements."""

# Play limit: 500 chars per language.
PLAY_RELEASE_NOTES = (
    "New: computers as nodes; talk to Jarvis from Discord or Slack; now "
    "playing card; photos in chat and in your Inbox; see what Jarvis did on "
    "its own; simple routines; phone-call settings; several Pantry stores.\n"
    "Improved: find nodes on your network, live Bluetooth pairing, clearer "
    "device states and Inbox buttons, a new chat look.\n"
    "Fixed: Android voice, clean sign-out, correct times, keyboard issues."
)
assert len(PLAY_RELEASE_NOTES) <= 500, "Play release notes exceed 500 chars"

# ── ASC categories ───────────────────────────────────────────────────────────
PRIMARY_CATEGORY = "LIFESTYLE"
SECONDARY_CATEGORY = "UTILITIES"

# ── Age rating answers (all "no" → 4+) ───────────────────────────────────────
AGE_RATING_ATTRS = {
    "advertising": False,
    "alcoholTobaccoOrDrugUseOrReferences": "NONE",
    "contests": "NONE",
    "gambling": False,
    "gamblingSimulated": "NONE",
    "gunsOrOtherWeapons": "NONE",
    "healthOrWellnessTopics": False,
    "kidsAgeBand": None,
    "lootBox": False,
    "medicalOrTreatmentInformation": "NONE",
    "messagingAndChat": False,
    "parentalControls": False,
    "profanityOrCrudeHumor": "NONE",
    "ageAssurance": False,
    "sexualContentGraphicAndNudity": "NONE",
    "sexualContentOrNudity": "NONE",
    "horrorOrFearThemes": "NONE",
    "matureOrSuggestiveThemes": "NONE",
    "unrestrictedWebAccess": False,
    "userGeneratedContent": False,
    "violenceCartoonOrFantasy": "NONE",
    "violenceRealisticProlongedGraphicOrSadistic": "NONE",
    "violenceRealistic": "NONE",
}

# ── Screenshot ordering (used by every store push) ───────────────────────────
# Captured 2026-07-07 (dark mode, iPhone 17 Pro Max sim — see screenshots/flows/store/).
# nodes.png is a 10th, App-Store-only shot (Play caps at 8 — see PLAY_SHOTS).
SHOTS = [
    "home.png",
    "devices.png",
    "routines.png",
    "routine-edit.png",
    "rooms.png",
    "inbox.png",
    "nav-pantry.png",
    "settings-household.png",
    "auth-landing.png",
    "nodes.png",
]
