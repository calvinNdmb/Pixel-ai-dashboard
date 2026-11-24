"""Pictures for the README, from the same model as the STL files.

    python3 tools/render.py                    # all pictures into pixel-phone/
    python3 tools/render.py --only swap        # one picture: preview, swap, print

The phone shows a real screenshot of the Pixel app (tools/ui/, Rétro theme, taken from pixel-app/ in demo mode at the
S25 Ultra's 3120 x 1440 shape, kiosk view). Rendering uses pixel-desk's small software rasterizer (scenelib.py).
"""
import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.append(str(HERE.parent.parent / "pixel-desk" / "tools"))
import mocks  # noqa: E402
from scenelib import BOLD, FONT, label, render, tube  # noqa: E402  (pixel-desk/tools/scenelib.py)

g = mocks.g
BEIGE = (0.90, 0.87, 0.78); BEIGE2 = (0.85, 0.82, 0.72); INSERT = (0.80, 0.77, 0.67)
DARK = (0.05, 0.07, 0.06); TITANIUM = (0.33, 0.34, 0.36); LENS = (0.12, 0.12, 0.14); PUCK = (0.22, 0.22, 0.24)
CABLE = (0.15, 0.15, 0.16); CASE_COL = (0.20, 0.22, 0.26); TEST_GREY = (0.8, 0.8, 0.84)
S = (1300, 1100)


def mv(m, dx=0.0, dy=0.0, dz=0.0):
    m = m.copy(); m.apply_translation([dx, dy, dz]); return m


def persp(src, dst):
    A, B = [], []
    for (x, y), (X, Y) in zip(dst, src):
        A.append([x, y, 1, 0, 0, 0, -X * x, -X * y]); B.append(X)
        A.append([0, 0, 0, x, y, 1, -Y * x, -Y * y]); B.append(Y)
    return np.linalg.solve(np.array(A, float), np.array(B, float)).tolist()


def put_ui(img, proj, ui, lo, T=None, shift=(0.0, 0.0, 0.0)):
    """Paste an app screenshot on the phone's screen (T: monitor -> scene transform)."""
    p = lo["p"]
    sw, sh = p["screen"]
    T = g.to_world() if T is None else T
    corners = [mocks.phone_uvw(lo, p["L"] / 2 + dx * sw / 2, p["W"] / 2 + dz * sh / 2, -0.08)
               for dx, dz in ((-1, 1), (1, 1), (1, -1), (-1, -1))]
    pts = [(T @ np.r_[c + np.asarray(shift), 1.0])[:3] for c in corners]
    dst = [proj(q) for q in pts]
    warped = ui.transform(img.size, Image.Transform.PERSPECTIVE, persp([(0, 0), (ui.width, 0), (ui.width, ui.height), (0, ui.height)], dst),
                          Image.Resampling.BICUBIC)
    mask = Image.new("L", img.size, 0); ImageDraw.Draw(mask).polygon([tuple(q) for q in dst], fill=255)
    img.paste(warped, (0, 0), mask)
    return img


def sheet(path, ims, titles, w):
    sh = Image.new("RGB", (w * len(ims), ims[0].height + 70), "white"); d = ImageDraw.Draw(sh)
    for i, (im, t) in enumerate(zip(ims, titles)):
        sh.paste(im, (i * w, 70)); d.text((i * w + 30, 20), t, fill=(30, 30, 30), font=BOLD)
    sh.save(path)
    print("saved", path)


def scene(insert_key=None):
    asm, inserts, prn = g.build_all()
    ins, lo = inserts[insert_key or g.insert_name()]
    return asm, ins, lo, prn


def phone_parts(lo, dy=0.0):
    ph = mocks.phone(lo)
    out = [(mv(ph["phone body"], dy=dy), TITANIUM), (mv(mocks.screen(lo), dy=dy), DARK), (mv(ph["camera"], dy=dy), LENS),
           (mv(ph["keys"], dy=dy), TITANIUM)]
    if "case" in ph:
        out.append((mv(ph["case"], dy=dy), CASE_COL))
    return out


def monitor_parts(asm, ins, lo, insert_dy=0.0, phone_dy=0.0, puck_dy=0.0, with_phone=True):
    disc, boot = mocks.puck(lo)
    parts = [(asm["PixelPhoneFront"], BEIGE), (asm["PixelPhoneBack"], BEIGE), (asm["PixelPhoneStand"], BEIGE2),
             (mv(ins, dy=insert_dy), INSERT), (mv(disc, dy=puck_dy), PUCK), (mv(boot, dy=puck_dy), CABLE)]
    if with_phone:
        parts += phone_parts(lo, phone_dy)
    return parts


def world(parts):
    return [(g.world(m), c) for m, c in parts]


def do_preview(out_dir, ui):
    asm, ins, lo, _ = scene()
    parts = world(monitor_parts(asm, ins, lo))
    cab = tube([(g.to_world() @ np.r_[q, 1.0])[:3] for q in mocks.puck_cable_path(lo)][4:] +
               [(0.0, g.world(asm["PixelPhoneBack"]).bounds[1][1] + 30.0, 2.0), (0.0, g.world(asm["PixelPhoneBack"]).bounds[1][1] + 80.0, 2.0)], 2.0)
    parts.append((cab, CABLE))
    im1, p1 = render(parts, (0.50, 0.80, -0.30), S, light=(0.35, -0.65, 0.70))
    put_ui(im1, p1, ui, lo)
    im2, p2 = render(parts, (-0.62, 0.70, -0.36), S, light=(-0.35, -0.65, 0.70))
    put_ui(im2, p2, ui, lo)
    sheet(out_dir / "preview.png", [im1, im2], ["Pixel Phone : le visage de Pixel sur le Galaxy S25 Ultra",
                                                "Il charge sans fil, par l'arrière"], S[0])


def tag(img, proj, p3, text, dx, dy, color=(30, 30, 30)):
    """label() from scenelib, kept inside the picture: flips to the other side if the text would run out."""
    d = ImageDraw.Draw(img)
    x, y = proj(p3)
    lines = text.split("\n")
    w = max(d.textlength(t, font=FONT) for t in lines) + 30
    h = 28 * len(lines) + 16
    if dx >= 0 and x + dx + w > img.width:
        dx = -abs(dx)
    elif dx < 0 and x + dx - w < 0:
        dx = abs(dx)
    dy = min(max(dy, h / 2 + 8 - y), img.height - h / 2 - 8 - y)
    label(img, proj, p3, text, dx, dy, color)


def do_swap(out_dir, ui):
    """Exploded: the insert pulled out of the monitor with the charger, the phone above it. And the insert alone,
    seen from the front, with its pockets (the phone's camera shown where it goes)."""
    asm, ins, lo, _ = scene()
    dy_ins, dy_phone, dz_phone = -95.0, -150.0, 75.0
    disc, boot = mocks.puck(lo)
    parts = [(asm["PixelPhoneFront"], BEIGE), (asm["PixelPhoneBack"], BEIGE), (asm["PixelPhoneStand"], BEIGE2),
             (mv(ins, dy=dy_ins), INSERT), (mv(disc, dy=dy_ins), PUCK), (mv(boot, dy=dy_ins), CABLE)]
    parts += [(mv(m, dz=dz_phone), c) for m, c in phone_parts(lo, dy_phone)]
    path = mocks.puck_cable_path(lo)
    path = [(x, y + dy_ins * (1.0 - min(max((y - g.INSERT_D) / 30.0, 0.0), 1.0)), z) for x, y, z in path]
    parts.append((tube(path, 2.0), CABLE))
    W = world(parts)
    im1, p1 = render(W, (0.42, 0.78, -0.46), S, light=(0.35, -0.65, 0.70), pad=60)
    put_ui(im1, p1, ui, lo, shift=(0.0, dy_phone, dz_phone))
    T = g.to_world()
    wp = lambda q: (T @ np.r_[q, 1.0])[:3]  # noqa: E731
    p = lo["p"]
    tag(im1, p1, wp(mocks.phone_uvw(lo, p["L"] - 10.0, p["W"] / 2 - 25.0, dy_phone) + [0, 0, dz_phone]),
        "Galaxy S25 Ultra\n(USB-C à droite)", 90, 70, (60, 60, 60))
    tag(im1, p1, wp((-g.BAY_W / 2 + 4.0, dy_ins + 1.0, g.bay_z() + 30.0)), "Support\ninterchangeable", -70, -140, (150, 110, 40))
    X, Z = g.uv_to_xz(lo, lo["puck_u"][0] + 10.0, p["W"] / 2 - 22.0)
    tag(im1, p1, wp((X, lo["puck_y"][0] + dy_ins - 0.2, Z)), "Chargeur Qi2 (galette)", 120, 170, (40, 40, 40))
    tag(im1, p1, wp((-g.BEZ_W / 2 + 30.0, -0.5, 6.0)), "Moniteur : cadre,\narrière et pied", -60, 120, (110, 110, 110))

    # the insert alone, from the front: the phone's camera where it goes, the charger, its cable
    alone = [(ins, INSERT), (disc, PUCK), (boot, CABLE), (mocks.lenses_only(lo), LENS)]
    im2, p2 = render(alone, (0.30, 0.86, -0.42), S, light=(0.3, -0.7, 0.65), pad=120)
    cam = max(lo["cam"][:3], key=lambda f: f[0].centroid.y)[0]
    cx, cz = g.uv_to_xz(lo, cam.centroid.x, cam.centroid.y)
    tag(im2, p2, (cx, lo["y_pb"] + 1.0, cz + 9.0), "Creux de la caméra :\nles objectifs ne touchent rien", -40, -190, (60, 60, 60))
    X, Z = g.uv_to_xz(lo, lo["puck_u"][0] + 8.0, p["W"] / 2 - 22.0)
    tag(im2, p2, (X, lo["puck_y"][0] - 0.2, Z), "Chargeur : glisse-le\nlà où le téléphone charge", 60, 230, (40, 40, 40))
    e0, e1 = g.exit_u(lo)
    X, Z = g.uv_to_xz(lo, (e0 + e1) / 2, p["W"] / 2)
    tag(im2, p2, (X, lo["puck_y"][1], Z), "Son câble part\npar l'arrière", 90, -200, (40, 40, 40))
    zc = g.phone_mid_z()
    tag(im2, p2, (-lo["well_w"] / 2 - 3.0, g.SCOOP_D - 0.5, zc - 4.0), "Creux pour les doigts", -60, 200, (150, 110, 40))
    sheet(out_dir / "preview-swap.png", [im1, im2], ["Le support du téléphone s'enlève par l'avant",
                                                    "Le support seul : caméra, chargeur, câble"], S[0])


def do_print(out_dir):
    _, _, _, prn = scene()
    layout = {"PixelPhoneFront": (0, 0), "PixelPhoneBack": (0, 140), "PixelPhoneSupport_S25U": (215, 0),
              "PixelPhoneStand": (215, 110), "PhoneFitTest_S25U": (340, 110), "PuckFitTest": (215, 235)}
    tests = ("PhoneFitTest_S25U", "PuckFitTest")
    plate = []
    for name, (x, y) in layout.items():
        m = prn[name].copy(); m.apply_translation([-m.bounds[0][0] + x, -m.bounds[0][1] + y, 0])
        plate.append((m, TEST_GREY if name in tests else (INSERT if "Support" in name else BEIGE)))
    im, _ = render(plate, (0.35, 0.60, -0.72), (1300, 1000), light=(0.3, -0.5, 0.8))
    im.save(out_dir / "preview-print.png")
    print("saved", out_dir / "preview-print.png")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ui", type=Path, default=HERE / "ui" / "retro-visage-s25u.png", help="Pixel app screenshot, 3120 x 1440 shape")
    ap.add_argument("--out", type=Path, default=HERE.parent, help="where to write the PNG files")
    ap.add_argument("--only", choices=["preview", "swap", "print"])
    a = ap.parse_args()
    a.out.mkdir(parents=True, exist_ok=True)
    ui = Image.open(a.ui).convert("RGB")
    jobs = {"preview": lambda: do_preview(a.out, ui), "swap": lambda: do_swap(a.out, ui), "print": lambda: do_print(a.out)}
    for k, job in jobs.items():
        if a.only in (None, k):
            job()


if __name__ == "__main__":
    main()
