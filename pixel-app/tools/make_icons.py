"""Draws the app's PNG icons from the same shapes as web/icon.svg:  python3 tools/make_icons.py
192 and 512 px for Android, plus a "maskable" one with a margin, since Android cuts it into a circle or a squircle."""
from pathlib import Path

from PIL import Image, ImageDraw

WEB = Path(__file__).resolve().parents[1] / "web"
SHAPES = [((8, 9, 48, 36), 5, "#061009"),                                                  # the screen
          ((18, 18, 6, 8), 0, "#46ff82"), ((40, 18, 6, 8), 0, "#46ff82"),                    # the eyes
          ((24, 33, 16, 3), 0, "#46ff82"), ((21, 31, 3, 3), 0, "#46ff82"), ((40, 31, 3, 3), 0, "#46ff82"),   # the smile
          ((14, 51, 36, 5), 2, "#b3ab93")]                                                   # the keyboard


def icon(size, margin=0.0):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d, s, k = ImageDraw.Draw(img), size / 64, 1 - 2 * margin
    if margin:
        d.rectangle([0, 0, size - 1, size - 1], fill="#d9d2bd")                            # maskable: the plastic fills the square
    else:
        d.rounded_rectangle([0, 0, size - 1, size - 1], radius=14 * s, fill="#d9d2bd")
    for (x, y, w, h), r, fill in SHAPES:
        x0, y0 = (margin * 64 + x * k) * s, (margin * 64 + y * k) * s
        d.rounded_rectangle([x0, y0, x0 + w * k * s - 1, y0 + h * k * s - 1], radius=r * k * s, fill=fill)
    return img


if __name__ == "__main__":
    icon(192).save(WEB / "icon-192.png")
    icon(512).save(WEB / "icon-512.png")
    icon(512, margin=0.12).save(WEB / "icon-maskable-512.png")
    print("web/icon-192.png, web/icon-512.png, web/icon-maskable-512.png")
