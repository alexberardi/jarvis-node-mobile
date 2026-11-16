#!/usr/bin/env python3
"""Push release notes (What's New) to both stores from ``_content.py``.

- App Store Connect: PATCH ``whatsNew`` on the editable version's en-US
  localization (requires a version in PREPARE_FOR_SUBMISSION; not editable
  on an app's very first version).
- Google Play: set ``releaseNotes`` on the newest release of the target
  track (default: internal). The notes ride along when the release is
  promoted to other tracks.

Usage:
    python3 push_release_notes.py                 # dry-run
    python3 push_release_notes.py --apply         # both stores
    python3 push_release_notes.py --apply --only asc
    python3 push_release_notes.py --apply --only play --track internal
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).parent))
from _config import (  # noqa: E402
    ASC_API_BASE,
    PLAY_LANGUAGE,
    PLAY_PACKAGE,
    asc_headers,
    get_asc_resources,
    play_credentials,
)
from _content import PLAY_RELEASE_NOTES, WHATS_NEW  # noqa: E402


def push_asc(dry: bool) -> None:
    print(f"── ASC whatsNew ({len(WHATS_NEW)} chars) ──")
    if dry:
        print("  [DRY] would PATCH appStoreVersionLocalizations.whatsNew")
        return
    h = asc_headers()
    ids = get_asc_resources(h)
    loc_id = ids["appStoreVersionLocalization"]
    r = requests.patch(
        f"{ASC_API_BASE}/appStoreVersionLocalizations/{loc_id}",
        headers={**h, "Content-Type": "application/json"},
        json={
            "data": {
                "type": "appStoreVersionLocalizations",
                "id": loc_id,
                "attributes": {"whatsNew": WHATS_NEW},
            }
        },
        timeout=30,
    )
    if r.status_code not in (200, 204):
        raise RuntimeError(f"ASC whatsNew failed {r.status_code}: {r.text[:600]}")
    print(f"  ✅ whatsNew set on localization {loc_id}")


def push_play(dry: bool, track: str) -> None:
    print(f"── Play releaseNotes ({len(PLAY_RELEASE_NOTES)} chars) → track '{track}' ──")
    if dry:
        print("  [DRY] would set releaseNotes on the newest release")
        return
    from google.auth.transport.requests import Request as GoogleAuthRequest

    creds = play_credentials()
    creds.refresh(GoogleAuthRequest())
    h = {"Authorization": f"Bearer {creds.token}"}
    base = (
        "https://androidpublisher.googleapis.com/androidpublisher/v3/"
        f"applications/{PLAY_PACKAGE}"
    )
    edit_id = requests.post(f"{base}/edits", headers=h, json={}, timeout=20).json()["id"]
    try:
        t = requests.get(f"{base}/edits/{edit_id}/tracks/{track}", headers=h, timeout=20)
        t.raise_for_status()
        body = t.json()
        releases = body.get("releases", [])
        if not releases:
            raise RuntimeError(f"no releases on track {track!r}")
        releases[0]["releaseNotes"] = [
            {"language": PLAY_LANGUAGE, "text": PLAY_RELEASE_NOTES}
        ]
        r = requests.put(
            f"{base}/edits/{edit_id}/tracks/{track}", headers=h, json=body, timeout=30
        )
        if not r.ok:
            raise RuntimeError(f"track update failed {r.status_code}: {r.text[:600]}")
        c = requests.post(f"{base}/edits/{edit_id}:commit", headers=h, timeout=30)
        if not c.ok:
            raise RuntimeError(f"commit failed {c.status_code}: {c.text[:600]}")
        rel = releases[0]
        print(f"  ✅ notes set on release {rel.get('name')} (versions {rel.get('versionCodes')}), edit committed")
    except Exception:
        requests.delete(f"{base}/edits/{edit_id}", headers=h, timeout=20)
        raise


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--only", choices=["asc", "play", "both"], default="both")
    ap.add_argument("--track", default="internal", help="Play track (default: internal)")
    args = ap.parse_args()

    dry = not args.apply
    if args.only in ("asc", "both"):
        push_asc(dry)
    if args.only in ("play", "both"):
        push_play(dry, args.track)
    print("Done." + (" (dry-run)" if dry else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
