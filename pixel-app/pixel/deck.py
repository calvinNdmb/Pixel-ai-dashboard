"""Stream Deck MK.2: draws the 15 keys in Pixel's green-screen style and sends presses to the hub."""
import asyncio
import logging
import os

from .keys import NAV

log = logging.getLogger("pixel.deck")
WEB = os.path.join(os.path.dirname(__file__), "..", "web")
DEJAVU = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
# key colours per theme: text, background, current screen (text, background), row-3 actions
STYLES = {
    "retro": {"fg": (70, 255, 130), "bg": (8, 16, 11), "cur": ((8, 16, 11), (70, 255, 130)), "act": (255, 179, 71), "font": [DEJAVU]},
    "moderne": {"fg": (232, 236, 255), "bg": (21, 27, 51), "cur": ((12, 17, 36), (127, 243, 255)), "act": (255, 184, 107), "font": [os.path.join(WEB, "Fredoka.ttf"), DEJAVU]},
    "manga": {"fg": (27, 27, 31), "bg": (251, 247, 238), "cur": ((251, 247, 238), (27, 27, 31)), "act": (232, 56, 79), "font": [os.path.join(WEB, "Bangers-Regular.ttf"), DEJAVU]},
    "neon": {"fg": (63, 246, 255), "bg": (12, 5, 34), "cur": ((12, 5, 34), (255, 79, 216)), "act": (255, 160, 61), "font": [os.path.join(WEB, "ChakraPetch-SemiBold.ttf"), DEJAVU]},
    "croquis": {"fg": (44, 44, 48), "bg": (251, 248, 239), "cur": ((24, 24, 27), (255, 233, 77)), "act": (210, 65, 44), "font": [os.path.join(WEB, "PatrickHand-Regular.ttf"), DEJAVU]},
    "lcd": {"fg": (32, 44, 24), "bg": (197, 208, 139), "cur": ((197, 208, 139), (32, 44, 24)), "act": (58, 76, 36), "font": [os.path.join(WEB, "PixelifySans.ttf"), DEJAVU]},
}


class Deck:
    def __init__(self, hub, cfg):
        self.hub, self.cfg = hub, cfg
        self.deck, self.cache, self.bright = None, {}, None
        self.loop = asyncio.get_running_loop()
        hub.listeners.append(self.sync)
        hub.s["settings"]["deck"] = "recherche…"

    async def connect(self):
        """Called periodically: (re)opens the first Stream Deck found."""
        if self.deck is not None:
            return
        try:
            from StreamDeck.DeviceManager import DeviceManager
        except ImportError:
            self.hub.s["settings"]["deck"] = "bibliothèque streamdeck absente"
            return
        try:
            decks = [d for d in DeviceManager().enumerate() if d.is_visual()]
        except Exception as e:                      # hidapi missing, no permission...
            msg = str(e)
            self.hub.s["settings"]["deck"] = ("pilote USB manquant (sudo apt install libhidapi-libusb0)" if "HID" in msg
                                              else "accès refusé (règle udev, voir install.sh)" if "ermission" in msg else f"erreur : {msg[:60]}")
            return
        if not decks:
            self.hub.s["settings"]["deck"] = "non branché"
            return
        d = decks[0]
        d.open()
        d.reset()
        d.set_key_callback(self._pressed)
        self.deck, self.cache, self.bright = d, {}, None
        self.hub.s["settings"]["deck"] = f"{d.deck_type()} ({d.key_count()} touches)"
        log.info("Stream Deck connected: %s", d.deck_type())
        self.sync(self.hub.snapshot())

    def _pressed(self, deck, key, down):            # runs in the Stream Deck's thread
        if down:
            asyncio.run_coroutine_threadsafe(self.press(key), self.loop)

    async def press(self, key):
        s = self.hub.s
        if key < len(NAV):
            await self.hub.dispatch("screen.show", {"screen": NAV[key]})
            return
        from .keys import row3
        k = row3(s["screen"], s)[key - len(NAV)] if key - len(NAV) < 5 else None
        if k:
            await self.hub.dispatch(k["action"], k["args"])

    def _image(self, label, fg, bg, fonts):
        from PIL import Image, ImageDraw, ImageFont
        from StreamDeck.ImageHelpers import PILHelper
        img = PILHelper.create_key_image(self.deck, background=bg)
        draw = ImageDraw.Draw(img)
        w, h = img.size
        for size in (17, 15, 13, 11):
            font = _font(ImageFont, size, fonts)
            box = draw.multiline_textbbox((0, 0), label, font=font, align="center")
            if box[2] - box[0] <= w - 8:
                break
        draw.multiline_text((w / 2, h / 2), label, font=font, fill=fg, anchor="mm", align="center", spacing=2)
        return PILHelper.to_native_key_format(self.deck, img)

    def sync(self, snap):
        """Redraw the keys whose label or colour changed."""
        if self.deck is None:
            return
        scr, theme = snap["screen"], snap["view"].get("theme", "retro")
        st = STYLES.get(theme, STYLES["retro"])
        fonts = tuple(st["font"])
        want = {}
        for i, k in enumerate(snap["keys"]["nav"]):
            want[i] = (k["label"], *st["cur"], fonts) if k["id"] == scr else (k["label"], st["fg"], st["bg"], fonts)
        for j, k in enumerate(snap["keys"]["row3"].get(scr, [None] * 5)):
            want[len(NAV) + j] = (k["label"], st["act"], st["bg"], fonts) if k else ("", st["bg"], st["bg"], fonts)
        changed = {i: v for i, v in want.items() if self.cache.get(i) != v}
        bright = 10 if scr == "veille" else int(self.cfg.get("brightness", 70))
        if not changed and bright == self.bright:
            return
        self.cache.update(changed)
        self.loop.run_in_executor(None, self._write, changed, bright)

    def _write(self, changed, bright):
        try:
            with self.deck:
                if bright != self.bright:
                    self.deck.set_brightness(bright)
                    self.bright = bright
                for i, (label, fg, bg, fonts) in changed.items():
                    self.deck.set_key_image(i, self._image(label, fg, bg, fonts))
        except Exception as e:                      # unplugged
            log.warning("Stream Deck lost: %s", e)
            self.deck, self.cache = None, {}
            self.hub.s["settings"]["deck"] = "débranché"


def _font(ImageFont, size, fonts):
    for f in fonts:
        try:
            font = ImageFont.truetype(f, size)
            if "Fredoka" in f or "Pixelify" in f:       # variable fonts: a bolder instance reads better on the keys
                try:
                    font.set_variation_by_name("SemiBold")
                except (OSError, ValueError):
                    pass
            return font
        except OSError:
            continue
    return ImageFont.load_default()
