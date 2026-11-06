"""Builds the README previews from the screenshots of tests/shots.js.

    python3 tests/sheets.py shots .      -> preview-themes.png (every mood, one column per theme)
                                            preview-themes-screens.png (six screens and the boot, one row per theme)
"""
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

APP = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP))
from pixel.keys import MOODS, THEMES  # noqa: E402

SHOTS, OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "shots"), Path(sys.argv[2] if len(sys.argv) > 2 else APP)
BG, INK, DIM = (22, 23, 20), (236, 230, 212), (150, 146, 130)
js = (APP / "web" / "themes.js").read_text()
MOOD_NAMES = {m[0]: m[1] or m[2] for m in re.findall(r"\{ id: '(\w+)', name: (?:'([^']+)'|\"([^\"]+)\")", js)}


def font(size, bold=True):
    for f in (f"/usr/share/fonts/truetype/dejavu/DejaVuSans{'-Bold' if bold else ''}.ttf",):
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            pass
    return ImageFont.load_default()


def save(img, path):           # 256 colours keep the file small; octree keeps every theme's hues
    img.convert("RGB").quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.FLOYDSTEINBERG).save(path, optimize=True)
    print(path, img.size, path.stat().st_size // 1024, "Ko")


def moods_sheet():
    tw, th, lab, top = 250, 150, 132, 36          # face crop 600x360 around the face, scaled down
    img = Image.new("RGB", (lab + len(THEMES) * (tw + 8) + 8, top + len(MOODS) * (th + 8) + 8), BG)
    d = ImageDraw.Draw(img)
    for i, (tid, name) in enumerate(THEMES.items()):
        d.text((lab + 8 + i * (tw + 8) + tw // 2, 10), name, fill=INK, font=font(20), anchor="mt")
    for j, m in enumerate(MOODS):
        y = top + 8 + j * (th + 8)
        d.text((12, y + th // 2), MOOD_NAMES.get(m, m), fill=INK, font=font(17), anchor="lm")
        for i, tid in enumerate(THEMES):
            shot = Image.open(SHOTS / f"{tid}-mood-{m}.png").crop((100, 40, 700, 400)).resize((tw, th), Image.LANCZOS)
            img.paste(shot, (lab + 8 + i * (tw + 8), y))
    save(img, OUT / "preview-themes.png")


def screens_sheet():
    names = ["lumieres", "claude", "meteo", "minuteur", "agenda", "systeme", "reglages", "boot-1500"]
    tw, th, lab = 300, 180, 120
    img = Image.new("RGB", (lab + 4 * (tw + 8) + 8, len(THEMES) * 2 * (th + 8) + len(THEMES) * 10 + 8), BG)
    d = ImageDraw.Draw(img)
    for i, (tid, name) in enumerate(THEMES.items()):
        y0 = 8 + i * (2 * (th + 8) + 10)
        d.text((12, y0 + th + 4), name, fill=INK, font=font(20), anchor="lm")
        for k, s in enumerate(names):
            shot = Image.open(SHOTS / f"{tid}-{s}.png").resize((tw, th), Image.LANCZOS)
            img.paste(shot, (lab + 8 + (k % 4) * (tw + 8), y0 + (k // 4) * (th + 8)))
    save(img, OUT / "preview-themes-screens.png")


moods_sheet()
screens_sheet()
