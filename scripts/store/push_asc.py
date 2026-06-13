#!/usr/bin/env python3
"""Push text-level App Store Connect listing fields plus the Age Rating
questionnaire. Pulls copy from ``_content.py``.

Usage:
    python3 push_asc.py            # dry-run (default)
    python3 push_asc.py --apply    # actually push

Does NOT handle screenshots (see ``push_asc_screenshots.py``) and does NOT
handle App Privacy nutrition labels (no public API — UI only; see
STORE-LISTING.md §1.7).
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).parent))
from _config import (  # noqa: E402
    ASC_API_BASE,
    asc_headers,
    get_asc_resources,
)
from _content import (  # noqa: E402
    AGE_RATING_ATTRS,
    COPYRIGHT,
    DESCRIPTION,
    KEYWORDS,
    MARKETING_URL,
    PRIMARY_CATEGORY,
    PRIVACY_POLICY_URL,
    PROMOTIONAL_TEXT,
    REVIEW_CONTACT,
    SECONDARY_CATEGORY,
    SUBTITLE,
    SUPPORT_URL,
)


def patch(headers, path, body, dry):
    if dry:
        print(f"  [DRY] PATCH {path}")
        return None
    r = requests.patch(
        f"{ASC_API_BASE}{path}",
        headers={**headers, "Content-Type": "application/json"},
        json=body,
        timeout=20,
    )
    if r.status_code not in (200, 204):
        print(f"  ❌ PATCH {path} → {r.status_code}: {r.text[:600]}")
        return None
    print(f"  ✅ PATCH {path} → {r.status_code}")
    return r.json() if r.text else None


def post(headers, path, body, dry):
    if dry:
        print(f"  [DRY] POST {path}")
        return None
    r = requests.post(
        f"{ASC_API_BASE}{path}",
        headers={**headers, "Content-Type": "application/json"},
        json=body,
        timeout=20,
    )
    if r.status_code not in (200, 201):
        print(f"  ❌ POST {path} → {r.status_code}: {r.text[:600]}")
        return None
    print(f"  ✅ POST {path} → {r.status_code}")
    return r.json() if r.text else None


def push(dry: bool):
    headers = asc_headers()
    ids = get_asc_resources(headers)
    print("Resolved IDs:")
    for k, v in ids.items():
        print(f"  {k}: {v}")
    print()

    print("[1/6] appInfoLocalization (subtitle, privacyPolicyUrl)")
    patch(headers, f"/appInfoLocalizations/{ids['appInfoLocalization']}", {
        "data": {
            "type": "appInfoLocalizations",
            "id": ids["appInfoLocalization"],
            "attributes": {
                "subtitle": SUBTITLE,
                "privacyPolicyUrl": PRIVACY_POLICY_URL,
            },
        }
    }, dry)

    print("[2/6] appInfo categories")
    patch(headers, f"/appInfos/{ids['appInfo']}", {
        "data": {
            "type": "appInfos",
            "id": ids["appInfo"],
            "relationships": {
                "primaryCategory": {
                    "data": {"type": "appCategories", "id": PRIMARY_CATEGORY}
                },
                "secondaryCategory": {
                    "data": {"type": "appCategories", "id": SECONDARY_CATEGORY}
                },
            },
        }
    }, dry)

    print("[3/6] appStoreVersion copyright")
    patch(headers, f"/appStoreVersions/{ids['appStoreVersion']}", {
        "data": {
            "type": "appStoreVersions",
            "id": ids["appStoreVersion"],
            "attributes": {"copyright": COPYRIGHT},
        }
    }, dry)

    print("[4/6] appStoreVersionLocalization (description, keywords, urls)")
    patch(headers, f"/appStoreVersionLocalizations/{ids['appStoreVersionLocalization']}", {
        "data": {
            "type": "appStoreVersionLocalizations",
            "id": ids["appStoreVersionLocalization"],
            "attributes": {
                "description": DESCRIPTION,
                "keywords": KEYWORDS,
                "marketingUrl": MARKETING_URL,
                "promotionalText": PROMOTIONAL_TEXT,
                "supportUrl": SUPPORT_URL,
                # whatsNew is not editable on the first version; skip it.
            },
        }
    }, dry)

    if ids["appStoreReviewDetail"]:
        print(f"[5/6] appStoreReviewDetail PATCH {ids['appStoreReviewDetail']}")
        patch(headers, f"/appStoreReviewDetails/{ids['appStoreReviewDetail']}", {
            "data": {
                "type": "appStoreReviewDetails",
                "id": ids["appStoreReviewDetail"],
                "attributes": REVIEW_CONTACT,
            }
        }, dry)
    else:
        print("[5/6] appStoreReviewDetail POST (create new)")
        post(headers, "/appStoreReviewDetails", {
            "data": {
                "type": "appStoreReviewDetails",
                "attributes": REVIEW_CONTACT,
                "relationships": {
                    "appStoreVersion": {
                        "data": {
                            "type": "appStoreVersions",
                            "id": ids["appStoreVersion"],
                        }
                    }
                },
            }
        }, dry)

    print("[6/6] ageRatingDeclaration")
    patch(headers, f"/ageRatingDeclarations/{ids['ageRatingDeclaration']}", {
        "data": {
            "type": "ageRatingDeclarations",
            "id": ids["ageRatingDeclaration"],
            "attributes": AGE_RATING_ATTRS,
        }
    }, dry)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true", help="actually push (default: dry-run)")
    args = ap.parse_args()
    push(dry=not args.apply)
    print("\nDone." + ("" if args.apply else "  (dry-run — nothing changed)"))


if __name__ == "__main__":
    sys.exit(main() or 0)
