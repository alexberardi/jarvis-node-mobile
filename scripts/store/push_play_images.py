#!/usr/bin/env python3
"""Push every Google Play graphic asset: icon, feature graphic, and all three
screenshot sizes (phone, 7" tablet, 10" tablet) for the default en-US locale.

Uses ``googleapiclient`` to handle the media-upload host routing (Play's image
upload endpoint lives on a different host than the rest of the API).

Usage:
    python3 push_play_images.py            # dry-run
    python3 push_play_images.py --apply    # push + commit edit
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

sys.path.insert(0, str(Path(__file__).parent))
from _config import (  # noqa: E402
    ASSETS_DIR,
    PLAY_LANGUAGE,
    PLAY_PACKAGE,
    STORE_DIR,
    play_credentials,
)
from _content import SHOTS  # noqa: E402

ICON_PATH = ASSETS_DIR / "play-store-icon-512.png"   # 512×512
FEATURE_PATH = ASSETS_DIR / "feature-graphic.png"    # 1024×500

PHONE_DIR = STORE_DIR / "play-phone"                 # 1500×2868
TABLET_7_DIR = STORE_DIR / "play-tablet-7"           # 1200×1920
TABLET_10_DIR = STORE_DIR / "ipad-13"                # 2048×2732 (shared with ASC)

SCREENSHOT_SETS = [
    ("phoneScreenshots", PHONE_DIR, "phoneScreenshot"),
    ("sevenInchScreenshots", TABLET_7_DIR, "7-inch screenshot"),
    ("tenInchScreenshots", TABLET_10_DIR, "10-inch screenshot"),
]


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    if not args.apply:
        print("[DRY] would push:")
        print(f"  icon            ← {ICON_PATH.relative_to(ASSETS_DIR.parent)}")
        print(f"  featureGraphic  ← {FEATURE_PATH.relative_to(ASSETS_DIR.parent)}")
        for image_type, src_dir, _ in SCREENSHOT_SETS:
            print(f"  {image_type:22s} ← {len(SHOTS)} files from {src_dir.relative_to(ASSETS_DIR.parent)}")
        print("Done. (dry-run)")
        return 0

    creds = play_credentials()
    service = build("androidpublisher", "v3", credentials=creds, cache_discovery=False)
    edits = service.edits()

    edit_id = edits.insert(packageName=PLAY_PACKAGE, body={}).execute()["id"]
    print(f"✅ edit {edit_id} created")

    def upload(image_type: str, file_path: Path, label: str):
        media = MediaFileUpload(str(file_path), mimetype="image/png", resumable=False)
        resp = edits.images().upload(
            editId=edit_id,
            packageName=PLAY_PACKAGE,
            language=PLAY_LANGUAGE,
            imageType=image_type,
            media_body=media,
        ).execute()
        sha = resp.get("image", {}).get("sha1", "?")
        print(f"  ✅ {label} ← {file_path.name}  (sha1={sha})")

    try:
        upload("icon", ICON_PATH, "icon")
        upload("featureGraphic", FEATURE_PATH, "featureGraphic")

        for image_type, src_dir, label in SCREENSHOT_SETS:
            edits.images().deleteall(
                editId=edit_id,
                packageName=PLAY_PACKAGE,
                language=PLAY_LANGUAGE,
                imageType=image_type,
            ).execute()
            print(f"  cleared existing {image_type}")
            for s in SHOTS:
                upload(image_type, src_dir / s, label)

        edits.commit(editId=edit_id, packageName=PLAY_PACKAGE).execute()
        print("✅ commit")
    except Exception as e:
        print(f"\nError: {e}")
        try:
            edits.delete(editId=edit_id, packageName=PLAY_PACKAGE).execute()
            print("  deleted edit (cleanup)")
        except Exception:
            pass
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
