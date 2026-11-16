#!/usr/bin/env python3
"""Render the App Store "universal" creative asset: one 16:9 image that serves
as both the product page header (iOS 27+, cropped to 21:9) and the search
results asset (cropped to 3:2).

  assets/store/creative-universal.png   (5244x2950 PNG, no alpha)

Key art (icon, name, tagline) stays inside Apple's universal safe area,
1402x962 at (1921, 660); the phones are background and may be cropped.
Built from the raw captures in screenshots/output/, like frame_shots.py.
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, str(Path(__file__).parent))
from frame_shots import BRAND_BG, HEADLINE_RGB, load_font, rounded  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
SHOTS_DIR = REPO / "screenshots" / "output"
OUT = REPO / "assets" / "store" / "creative-universal.png"
ICON = REPO / "assets" / "app-store-icon-1024.png"

W, H = 5244, 2950
SAFE = (1921, 660, 1921 + 1402, 660 + 962)  # x0, y0, x1, y1
TAGLINE_RGB = (178, 178, 205)
GLOW_RGB = (124, 92, 191)

# (shot, centre x, rotation degrees, dim 0..1); back phones first so front ones overlap them.
PHONES = [
    ("devices", 480, 9, 0.55),
    ("routines", 4764, -9, 0.55),
    ("home", 1260, 5, 0.25),
    ("inbox", 3984, -5, 0.25),
]
PHONE_H = 2300
CENTRE_Y = 1475


def phone(name: str, dim: float) -> Image.Image:
    src = Image.open(SHOTS_DIR / f"{name}.png").convert("RGB")
    w = round(src.width * PHONE_H / src.height)
    shot = src.resize((w, PHONE_H), Image.Resampling.LANCZOS)
    if dim:
        shot = Image.blend(shot, Image.new("RGB", shot.size, BRAND_BG), dim)
    out = rounded(shot, radius=110)
    ImageDraw.Draw(out).rounded_rectangle([0, 0, w - 1, PHONE_H - 1], radius=110,
                                          outline=(255, 255, 255, 40), width=6)
    return out


def main() -> None:
    canvas = Image.new("RGB", (W, H), BRAND_BG)

    # Soft violet glow behind the key art.
    glow = Image.new("L", (W, H), 0)
    ImageDraw.Draw(glow).ellipse([W // 2 - 1300, 300, W // 2 + 1300, 2100], fill=90)
    glow = glow.filter(ImageFilter.GaussianBlur(320))
    canvas.paste(Image.new("RGB", (W, H), GLOW_RGB), (0, 0), glow)

    for name, cx, angle, dim in PHONES:
        p = phone(name, dim).rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
        canvas.paste(p, (cx - p.width // 2, CENTRE_Y - p.height // 2), p)

    # Key art, centred in the safe area.
    draw = ImageDraw.Draw(canvas)
    sx0, sy0, sx1, sy1 = SAFE
    mid = (sx0 + sx1) // 2
    icon = rounded(Image.open(ICON).convert("RGB").resize((340, 340), Image.Resampling.LANCZOS), 76)
    canvas.paste(icon, (mid - 170, sy0 + 60), icon)
    title, tag = load_font(150), load_font(68)
    for text, font, y, rgb in [
        ("Jarvis Automation", title, sy0 + 470, HEADLINE_RGB),
        ("Your home, your voice, fully private.", tag, sy0 + 690, TAGLINE_RGB),
    ]:
        w = draw.textlength(text, font=font)
        assert w <= sx1 - sx0, f"{text!r} is wider than the safe area"
        draw.text((mid - w / 2, y), text, font=font, fill=rgb)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(OUT, "PNG", optimize=True)
    print(f"  {OUT.relative_to(REPO)} {canvas.size}")


if __name__ == "__main__":
    main()
