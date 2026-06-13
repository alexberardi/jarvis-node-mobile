"""Shared config for the store-publish scripts.

Credential paths default to ~/Downloads but can be overridden with env vars:

    JARVIS_ASC_KEY_PATH      Path to AuthKey_<id>.p8 (App Store Connect API key)
    JARVIS_ASC_KEY_ID        Key ID matching the .p8 (default: 3BN4298AK5)
    JARVIS_ASC_ISSUER_ID     Issuer ID from ASC → Users and Access → Integrations
    JARVIS_PLAY_SA_PATH      Path to the Play service account JSON

The App ID, package name, and asset paths are static identifiers and stay in code.
"""
from __future__ import annotations

import os
import time
from pathlib import Path
from typing import TypedDict

import jwt
import requests

# ── Paths ────────────────────────────────────────────────────────────────────
REPO = Path(__file__).resolve().parents[2]
ASSETS_DIR = REPO / "assets"
SHOTS_DIR = REPO / "screenshots" / "output"
STORE_DIR = ASSETS_DIR / "store"

# ── App Store Connect ────────────────────────────────────────────────────────
ASC_APP_ID = "6760924901"
ASC_API_BASE = "https://api.appstoreconnect.apple.com/v1"

ASC_KEY_PATH = Path(
    os.environ.get(
        "JARVIS_ASC_KEY_PATH",
        str(Path.home() / "Downloads" / "AuthKey_3BN4298AK5.p8"),
    )
)
ASC_KEY_ID = os.environ.get("JARVIS_ASC_KEY_ID", "3BN4298AK5")
ASC_ISSUER_ID = os.environ.get(
    "JARVIS_ASC_ISSUER_ID", "69a6de97-6aaf-47e3-e053-5b8c7c11a4d1"
)

# ── Google Play ──────────────────────────────────────────────────────────────
PLAY_PACKAGE = "com.jarvis.nodemobile"
PLAY_LANGUAGE = "en-US"

PLAY_SA_PATH = Path(
    os.environ.get(
        "JARVIS_PLAY_SA_PATH",
        str(Path.home() / "Downloads" / "google-service-account.json"),
    )
)


# ── Helpers ──────────────────────────────────────────────────────────────────
def asc_token() -> str:
    """Generate a short-lived JWT for App Store Connect."""
    if not ASC_KEY_PATH.exists():
        raise FileNotFoundError(
            f"ASC private key not found at {ASC_KEY_PATH}. "
            f"Set JARVIS_ASC_KEY_PATH to point at your .p8 file."
        )
    now = int(time.time())
    return jwt.encode(
        {
            "iss": ASC_ISSUER_ID,
            "iat": now,
            "exp": now + 600,
            "aud": "appstoreconnect-v1",
        },
        ASC_KEY_PATH.read_text(),
        algorithm="ES256",
        headers={"kid": ASC_KEY_ID, "typ": "JWT"},
    )


def asc_headers() -> dict:
    return {"Authorization": f"Bearer {asc_token()}"}


class ASCResources(TypedDict):
    appInfo: str
    appInfoLocalization: str
    appStoreVersion: str
    appStoreVersionLocalization: str
    appStoreReviewDetail: str | None
    ageRatingDeclaration: str


def get_asc_resources(headers: dict) -> ASCResources:
    """Look up every per-app resource ID needed by the push scripts.

    Returns the IDs for the currently-editable appStoreVersion (state =
    PREPARE_FOR_SUBMISSION) and its en-US localizations. Fails fast if the
    editable version doesn't exist.
    """

    def get(path, **params):
        r = requests.get(
            f"{ASC_API_BASE}{path}", headers=headers, params=params, timeout=20
        )
        r.raise_for_status()
        return r.json()

    app_infos = get(f"/apps/{ASC_APP_ID}/appInfos")["data"]
    info = next(
        (x for x in app_infos if x["attributes"]["appStoreState"] == "PREPARE_FOR_SUBMISSION"),
        app_infos[0],
    )

    info_locs = get(f"/appInfos/{info['id']}/appInfoLocalizations")["data"]
    info_loc = next(x for x in info_locs if x["attributes"]["locale"] == PLAY_LANGUAGE)

    versions = get(f"/apps/{ASC_APP_ID}/appStoreVersions")["data"]
    version = next(
        (x for x in versions if x["attributes"]["appStoreState"] == "PREPARE_FOR_SUBMISSION"),
        versions[0],
    )

    v_locs = get(f"/appStoreVersions/{version['id']}/appStoreVersionLocalizations")["data"]
    v_loc = next(x for x in v_locs if x["attributes"]["locale"] == PLAY_LANGUAGE)

    review_detail_id: str | None = None
    try:
        rd = get(f"/appStoreVersions/{version['id']}/appStoreReviewDetail")
        if rd.get("data"):
            review_detail_id = rd["data"]["id"]
    except requests.HTTPError:
        pass

    # Age rating declaration is attached to appInfo (same UUID).
    return {
        "appInfo": info["id"],
        "appInfoLocalization": info_loc["id"],
        "appStoreVersion": version["id"],
        "appStoreVersionLocalization": v_loc["id"],
        "appStoreReviewDetail": review_detail_id,
        "ageRatingDeclaration": info["id"],
    }


def play_credentials():
    """Return google-auth credentials scoped for the Play Developer API."""
    from google.oauth2 import service_account

    if not PLAY_SA_PATH.exists():
        raise FileNotFoundError(
            f"Play service account JSON not found at {PLAY_SA_PATH}. "
            f"Set JARVIS_PLAY_SA_PATH to point at it."
        )
    return service_account.Credentials.from_service_account_file(
        str(PLAY_SA_PATH),
        scopes=["https://www.googleapis.com/auth/androidpublisher"],
    )
