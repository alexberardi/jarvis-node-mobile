#!/usr/bin/env python3
"""Render framed, captioned marketing variants of the store screenshots.

For each screenshot in ``_content.SHOTS`` this composites the raw capture
onto the brand background with rounded corners, a hairline bezel, and a
short headline. Outputs exact store-accepted sizes:

  assets/store/framed-appstore/<name>.png    (1320×2868, ASC iPhone 6.9")
  assets/store/framed-play-phone/<name>.png  (1500×2868, Play phone)

Idempotent — safe to re-run after recapturing any screenshot.
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).parent))
from _content import SHOTS  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
SHOTS_DIR = REPO / "screenshots" / "output"
STORE = REPO / "assets" / "store"

# name → (dir, canvas size). Sizes are the exact store-accepted dimensions,
# mirroring the raw-derived dirs prepare_assets.py produces.
OUTPUTS = {
    "framed-appstore": (STORE / "framed-appstore", (1320, 2868)),      # ASC iPhone 6.9"
    "framed-play-phone": (STORE / "framed-play-phone", (1500, 2868)),  # Play phone
    "framed-ipad-13": (STORE / "framed-ipad-13", (2048, 2732)),        # ASC iPad 13" / Play 10"
    "framed-play-tablet-7": (STORE / "framed-play-tablet-7", (1200, 1920)),  # Play 7"
}

BRAND_BG = (13, 13, 43)  # #0d0d2b (splash colour, see app.json)
HEADLINE_RGB = (237, 237, 247)
BEZEL_RGB = (255, 255, 255, 36)

# name (sans .png) → headline. Keep to ~28 chars/line, max 2 lines.
HEADLINES: dict[str, str] = {
    "home": "Ask anything.\nControl everything.",
    "devices": "Every device,\norganized by room",
    "routines": "Routines that\nrun your day",
    "routine-edit": "Build automations,\nstep by step",
    "rooms": "Your home,\nfloor by floor",
    "inbox": "Alerts and reminders,\ndelivered quietly",
    "nav-pantry": "Add skills\nfrom the Pantry",
    "household": "Your whole household,\nin one place",
    "settings-household": "Choose how\nJarvis talks",
    "auth-landing": "Self-hosted.\nPrivate by design.",
}


def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path, index in [
        ("/System/Library/Fonts/HelveticaNeue.ttc", 10),  # Bold face
        ("/System/Library/Fonts/HelveticaNeue.ttc", 0),
        ("/System/Library/Fonts/Helvetica.ttc", 1),
        ("/System/Library/Fonts/Helvetica.ttc", 0),
    ]:
        try:
            return ImageFont.truetype(path, size, index=index)
        except OSError:
            continue
    return ImageFont.load_default(size)


def rounded(im: Image.Image, radius: int) -> Image.Image:
    mask = Image.new("L", im.size, 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0, 0, im.size[0] - 1, im.size[1] - 1], radius=radius, fill=255)
    out = im.convert("RGBA")
    out.putalpha(mask)
    return out


def frame(name: str, canvas_w: int, canvas_h: int) -> Image.Image:
    src = Image.open(SHOTS_DIR / f"{name}.png").convert("RGB")
    canvas = Image.new("RGB", (canvas_w, canvas_h), BRAND_BG)
    draw = ImageDraw.Draw(canvas, "RGBA")

    # Scale typography with the canvas so tablet sizes keep proportions.
    k = canvas_w / 1320
    font = load_font(round(96 * k))
    line_h = round(118 * k)
    text_top = round(128 * k)
    corner = max(24, round(64 * k))

    headline = HEADLINES.get(name, "")
    lines = headline.split("\n") if headline else []
    for i, line in enumerate(lines):
        w = draw.textlength(line, font=font)
        draw.text(((canvas_w - w) / 2, text_top + i * line_h), line,
                  font=font, fill=HEADLINE_RGB)

    # Screenshot below the headline, rounded + hairline bezel
    top = text_top + len(lines) * line_h + round(96 * k)
    bottom_margin = round(128 * k)
    avail_h = canvas_h - top - bottom_margin
    scale = min(avail_h / src.height, (canvas_w - round(200 * k)) / src.width)
    new_size = (round(src.width * scale), round(src.height * scale))
    shot = src.resize(new_size, Image.Resampling.LANCZOS)
    shot = rounded(shot, radius=corner)
    x = (canvas_w - new_size[0]) // 2
    canvas.paste(shot, (x, top), shot)
    draw.rounded_rectangle(
        [x, top, x + new_size[0] - 1, top + new_size[1] - 1],
        radius=corner, outline=BEZEL_RGB, width=3,
    )
    return canvas


def main() -> None:
    for out_dir, _ in OUTPUTS.values():
        out_dir.mkdir(parents=True, exist_ok=True)
    for fname in SHOTS:
        name = fname.removesuffix(".png")
        for out_dir, (w, h) in OUTPUTS.values():
            frame(name, w, h).save(out_dir / fname, "PNG", optimize=True)
        print(f"  {fname}")
    print("Done.")


if __name__ == "__main__":
    main()
