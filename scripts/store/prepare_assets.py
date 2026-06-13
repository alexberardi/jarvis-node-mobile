#!/usr/bin/env python3
"""Regenerate derivative store assets from the iPhone screenshots in
``screenshots/output/`` and the source icon.

Outputs:
  assets/app-store-icon-1024.png            (1024×1024 RGB, App Store)
  assets/store/ipad-13/<name>.png           (2048×2732, ASC iPad + Play 10")
  assets/store/play-phone/<name>.png        (1500×2868, Play phone)
  assets/store/play-tablet-7/<name>.png     (1200×1920, Play 7" tablet)

Idempotent. Safe to re-run after recapturing any iPhone screenshot.
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

# Allow imports from the sibling _config module when run as a script
sys.path.insert(0, str(Path(__file__).parent))
from _config import ASSETS_DIR, SHOTS_DIR, STORE_DIR  # noqa: E402
from _content import SHOTS  # noqa: E402

SRC_ICON = ASSETS_DIR / "play-store-icon-512.png"
OUT_ICON = ASSETS_DIR / "app-store-icon-1024.png"

OUT_IPAD = STORE_DIR / "ipad-13"
OUT_PLAY_PHONE = STORE_DIR / "play-phone"
OUT_PLAY_TABLET_7 = STORE_DIR / "play-tablet-7"

BRAND_BG = (13, 13, 43)  # #0d0d2b (splash colour, see app.json)


def make_app_store_icon():
    """Flatten alpha, upscale 512 → 1024 with Lanczos."""
    src = Image.open(SRC_ICON).convert("RGBA")
    flat = Image.new("RGB", src.size, BRAND_BG)
    flat.paste(src, mask=src.split()[3])
    big = flat.resize((1024, 1024), Image.LANCZOS)
    big.save(OUT_ICON, "PNG", optimize=True)
    print(f"  → {OUT_ICON.relative_to(ASSETS_DIR.parent)} ({big.size})")


def composite_centered(src_path: Path, dst_path: Path, target_w: int, target_h: int):
    """Scale source to fit by height, center it on a target canvas."""
    src = Image.open(src_path).convert("RGB")
    sw, sh = src.size
    scale = target_h / sh
    new_w = int(sw * scale)
    scaled = src.resize((new_w, target_h), Image.LANCZOS)
    canvas = Image.new("RGB", (target_w, target_h), BRAND_BG)
    canvas.paste(scaled, ((target_w - new_w) // 2, 0))
    canvas.save(dst_path, "PNG", optimize=True)


def pad_sides(src_path: Path, dst_path: Path, target_w: int):
    """Pad source horizontally (preserve original height + content)."""
    src = Image.open(src_path).convert("RGB")
    sw, sh = src.size
    canvas = Image.new("RGB", (target_w, sh), BRAND_BG)
    canvas.paste(src, ((target_w - sw) // 2, 0))
    canvas.save(dst_path, "PNG", optimize=True)


def main():
    for d in (OUT_IPAD, OUT_PLAY_PHONE, OUT_PLAY_TABLET_7):
        d.mkdir(parents=True, exist_ok=True)

    print("── Icon (1024×1024 RGB) ─────────────────────────")
    make_app_store_icon()

    print("\n── iPad 13\" / Play 10\" tablet (2048×2732) ──────")
    for name in SHOTS:
        composite_centered(SHOTS_DIR / name, OUT_IPAD / name, 2048, 2732)
        print(f"  {name}")

    print("\n── Play phone (1500×2868, side-padded) ─────────")
    for name in SHOTS:
        pad_sides(SHOTS_DIR / name, OUT_PLAY_PHONE / name, 1500)
        print(f"  {name}")

    print("\n── Play 7\" tablet (1200×1920) ──────────────────")
    for name in SHOTS:
        composite_centered(SHOTS_DIR / name, OUT_PLAY_TABLET_7 / name, 1200, 1920)
        print(f"  {name}")

    print("\nDone.")


if __name__ == "__main__":
    sys.exit(main() or 0)
