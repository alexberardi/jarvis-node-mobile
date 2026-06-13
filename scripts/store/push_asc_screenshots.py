#!/usr/bin/env python3
"""Push iPhone 6.9" and iPad 13" screenshot sets to App Store Connect.

For each set:
  1. POST /appScreenshotSets — find or create the set for the display type
  2. DELETE any existing screenshots in the set (clean slate)
  3. For each PNG (in canonical order):
       a. POST /appScreenshots → response has uploadOperations[]
       b. PUT bytes[offset:offset+length] for each op
       c. PATCH /appScreenshots/{id}  (uploaded=true, sourceFileChecksum=md5)
  4. PATCH /appScreenshotSets/{id}/relationships/appScreenshots — set order

Apple's API still uses ``APP_IPHONE_67`` as the bucket for both 6.7" and 6.9"
screenshots; ``APP_IPAD_PRO_3GEN_129`` is the iPad 13".

Usage:
    python3 push_asc_screenshots.py                   # dry-run
    python3 push_asc_screenshots.py --apply           # both sets
    python3 push_asc_screenshots.py --apply --only iphone
    python3 push_asc_screenshots.py --apply --only ipad
"""
from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).parent))
from _config import (  # noqa: E402
    ASC_API_BASE,
    SHOTS_DIR,
    STORE_DIR,
    asc_headers,
    get_asc_resources,
)
from _content import SHOTS  # noqa: E402

IPHONE_DIR = SHOTS_DIR                    # raw 1320×2868 captures
IPAD_DIR = STORE_DIR / "ipad-13"          # 2048×2732 simulated


def get_or_create_set(headers, version_loc_id: str, display_type: str) -> str:
    r = requests.get(
        f"{ASC_API_BASE}/appStoreVersionLocalizations/{version_loc_id}/appScreenshotSets",
        headers=headers,
        timeout=20,
    )
    r.raise_for_status()
    for s in r.json().get("data", []):
        if s["attributes"]["screenshotDisplayType"] == display_type:
            print(f"  using existing set for {display_type}: {s['id']}")
            return s["id"]

    body = {
        "data": {
            "type": "appScreenshotSets",
            "attributes": {"screenshotDisplayType": display_type},
            "relationships": {
                "appStoreVersionLocalization": {
                    "data": {
                        "type": "appStoreVersionLocalizations",
                        "id": version_loc_id,
                    }
                }
            },
        }
    }
    r = requests.post(
        f"{ASC_API_BASE}/appScreenshotSets",
        headers={**headers, "Content-Type": "application/json"},
        json=body,
        timeout=20,
    )
    if r.status_code != 201:
        raise RuntimeError(f"create set failed {r.status_code}: {r.text[:400]}")
    sid = r.json()["data"]["id"]
    print(f"  created set for {display_type}: {sid}")
    return sid


def upload_screenshot(headers, set_id: str, file_path: Path) -> str:
    data = file_path.read_bytes()
    file_size = len(data)
    md5_hex = hashlib.md5(data).hexdigest()

    body = {
        "data": {
            "type": "appScreenshots",
            "attributes": {"fileName": file_path.name, "fileSize": file_size},
            "relationships": {
                "appScreenshotSet": {
                    "data": {"type": "appScreenshotSets", "id": set_id}
                }
            },
        }
    }
    r = requests.post(
        f"{ASC_API_BASE}/appScreenshots",
        headers={**headers, "Content-Type": "application/json"},
        json=body,
        timeout=30,
    )
    if r.status_code != 201:
        raise RuntimeError(f"reserve failed {r.status_code}: {r.text[:600]}")
    res = r.json()["data"]
    screenshot_id = res["id"]
    upload_ops = res["attributes"]["uploadOperations"]

    for op in upload_ops:
        chunk = data[op["offset"]:op["offset"] + op["length"]]
        op_headers = {h["name"]: h["value"] for h in op.get("requestHeaders", [])}
        r2 = requests.request(
            op["method"], op["url"], data=chunk, headers=op_headers, timeout=120
        )
        if r2.status_code not in (200, 201, 204):
            raise RuntimeError(f"chunk upload failed {r2.status_code}: {r2.text[:400]}")

    commit = {
        "data": {
            "type": "appScreenshots",
            "id": screenshot_id,
            "attributes": {"uploaded": True, "sourceFileChecksum": md5_hex},
        }
    }
    r3 = requests.patch(
        f"{ASC_API_BASE}/appScreenshots/{screenshot_id}",
        headers={**headers, "Content-Type": "application/json"},
        json=commit,
        timeout=30,
    )
    if r3.status_code not in (200, 204):
        raise RuntimeError(f"commit failed {r3.status_code}: {r3.text[:400]}")
    return screenshot_id


def reorder(headers, set_id: str, ids: list[str]):
    body = {"data": [{"type": "appScreenshots", "id": sid} for sid in ids]}
    r = requests.patch(
        f"{ASC_API_BASE}/appScreenshotSets/{set_id}/relationships/appScreenshots",
        headers={**headers, "Content-Type": "application/json"},
        json=body,
        timeout=20,
    )
    if r.status_code not in (200, 204):
        print(f"  ⚠️ reorder failed {r.status_code}: {r.text[:300]}")


def push_set(headers, version_loc_id: str, display_type: str, src_dir: Path):
    print(f"\n── {display_type} ← {src_dir} ──")
    set_id = get_or_create_set(headers, version_loc_id, display_type)

    # Clean slate before re-upload
    r = requests.get(
        f"{ASC_API_BASE}/appScreenshotSets/{set_id}/appScreenshots",
        headers=headers,
        timeout=20,
    )
    if r.ok:
        for existing in r.json().get("data", []):
            rd = requests.delete(
                f"{ASC_API_BASE}/appScreenshots/{existing['id']}",
                headers=headers,
                timeout=20,
            )
            print(f"  deleted existing {existing['id']} → {rd.status_code}")

    ids: list[str] = []
    for name in SHOTS:
        src = src_dir / name
        print(f"  uploading {name} ({src.stat().st_size:,} bytes)")
        sid = upload_screenshot(headers, set_id, src)
        print(f"    committed {sid}")
        ids.append(sid)

    reorder(headers, set_id, ids)
    print(f"  reordered ({len(ids)} screenshots)")


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--only", choices=["iphone", "ipad", "both"], default="both")
    args = ap.parse_args()

    if not args.apply:
        print("[DRY] would push:")
        if args.only in ("iphone", "both"):
            print(f"  APP_IPHONE_67: {len(SHOTS)} from {IPHONE_DIR}")
        if args.only in ("ipad", "both"):
            print(f"  APP_IPAD_PRO_3GEN_129: {len(SHOTS)} from {IPAD_DIR}")
        return 0

    h = asc_headers()
    ids = get_asc_resources(h)
    version_loc_id = ids["appStoreVersionLocalization"]

    if args.only in ("iphone", "both"):
        push_set(h, version_loc_id, "APP_IPHONE_67", IPHONE_DIR)
    if args.only in ("ipad", "both"):
        push_set(h, version_loc_id, "APP_IPAD_PRO_3GEN_129", IPAD_DIR)
    print("\nDone.")


if __name__ == "__main__":
    sys.exit(main() or 0)
