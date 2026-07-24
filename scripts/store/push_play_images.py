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

# Google Play allows at most 8 screenshots per device type (ASC allows 10).
# SHOTS is ordered by priority, so ship the first 8 here.
PLAY_SHOTS = SHOTS[:8]

ICON_PATH = ASSETS_DIR / "play-store-icon-512.png"   # 512×512
FEATURE_PATH = ASSETS_DIR / "feature-graphic.png"    # 1024×500

# --style raw:    full-bleed captures / composited derivatives
# --style framed: captioned marketing frames from frame_shots.py
SRC_DIRS = {
    "raw": {
        "phone": STORE_DIR / "play-phone",           # 1500×2868
        "tablet7": STORE_DIR / "play-tablet-7",      # 1200×1920
        "tablet10": STORE_DIR / "ipad-13",           # 2048×2732 (shared with ASC)
    },
    "framed": {
        "phone": STORE_DIR / "framed-play-phone",
        "tablet7": STORE_DIR / "framed-play-tablet-7",
        "tablet10": STORE_DIR / "framed-ipad-13",
    },
}


def screenshot_sets(style: str):
    dirs = SRC_DIRS[style]
    return [
        ("phoneScreenshots", dirs["phone"], "phoneScreenshot"),
        ("sevenInchScreenshots", dirs["tablet7"], "7-inch screenshot"),
        ("tenInchScreenshots", dirs["tablet10"], "10-inch screenshot"),
    ]


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--style", choices=["raw", "framed"], default="raw")
    args = ap.parse_args()

    sets = screenshot_sets(args.style)
    if not args.apply:
        print("[DRY] would push:")
        print(f"  icon            ← {ICON_PATH.relative_to(ASSETS_DIR.parent)}")
        print(f"  featureGraphic  ← {FEATURE_PATH.relative_to(ASSETS_DIR.parent)}")
        for image_type, src_dir, _ in sets:
            print(f"  {image_type:22s} ← {len(PLAY_SHOTS)} files from {src_dir.relative_to(ASSETS_DIR.parent)}")
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

        for image_type, src_dir, label in sets:
            edits.images().deleteall(
                editId=edit_id,
                packageName=PLAY_PACKAGE,
                language=PLAY_LANGUAGE,
                imageType=image_type,
            ).execute()
            print(f"  cleared existing {image_type}")
            for s in PLAY_SHOTS:
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
