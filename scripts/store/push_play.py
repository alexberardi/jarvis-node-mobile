#!/usr/bin/env python3
"""Push the Google Play listing text (title, short + full description) for the
default en-US locale. Pulls copy from ``_content.py``.

Usage:
    python3 push_play.py            # dry-run
    python3 push_play.py --apply    # actually push and commit edit

Does NOT handle images (see ``push_play_images.py``) and does NOT handle the
Data Safety form, Content Rating, App Access, or other declarations — those are
UI-only (see STORE-LISTING.md §2.4–2.5).
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import requests
from google.auth.transport.requests import Request as GoogleAuthRequest

sys.path.insert(0, str(Path(__file__).parent))
from _config import PLAY_LANGUAGE, PLAY_PACKAGE, play_credentials  # noqa: E402
from _content import DESCRIPTION, SHORT_DESCRIPTION  # noqa: E402

BASE = f"https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{PLAY_PACKAGE}"
TITLE = "Jarvis Automation"


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    if not args.apply:
        print("[DRY] would PUT listing:")
        print(f"  language:         {PLAY_LANGUAGE}")
        print(f"  title:            {TITLE!r}")
        print(f"  shortDescription: {SHORT_DESCRIPTION!r}")
        print(f"  fullDescription:  ({len(DESCRIPTION)} chars)")
        print("Done. (dry-run)")
        return 0

    creds = play_credentials()
    creds.refresh(GoogleAuthRequest())
    h = {"Authorization": f"Bearer {creds.token}"}

    r = requests.post(f"{BASE}/edits", headers=h, json={}, timeout=20)
    r.raise_for_status()
    edit_id = r.json()["id"]
    print(f"✅ edit {edit_id} created")

    body = {
        "language": PLAY_LANGUAGE,
        "title": TITLE,
        "shortDescription": SHORT_DESCRIPTION,
        "fullDescription": DESCRIPTION,
    }
    r = requests.put(
        f"{BASE}/edits/{edit_id}/listings/{PLAY_LANGUAGE}",
        headers={**h, "Content-Type": "application/json"},
        json=body,
        timeout=30,
    )
    if r.status_code != 200:
        print(f"❌ PUT listing → {r.status_code}: {r.text[:600]}")
        requests.delete(f"{BASE}/edits/{edit_id}", headers=h, timeout=10)
        return 1
    print(f"✅ PUT listing → {r.status_code}")

    r = requests.post(f"{BASE}/edits/{edit_id}:commit", headers=h, timeout=30)
    if r.status_code != 200:
        print(f"❌ commit → {r.status_code}: {r.text[:600]}")
        return 1
    print(f"✅ commit → {r.status_code}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
