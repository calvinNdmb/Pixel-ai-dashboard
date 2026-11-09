"""Pictures for the README, from the same model as the STL files.

    python3 tools/render.py                    # all pictures into pixel-desk/
    python3 tools/render.py --only posts       # one picture: preview, inside, print, posts, sdtest, v2
    python3 tools/render.py --ui DIR           # app screenshots (800 x 480 PNG) to show on the screen

The screen shows real screenshots of the Pixel app (tools/ui/, taken from pixel-app/).
Rendering is a small software rasterizer (scenelib.py): about a minute per view.
"""
import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import mocks  # noqa: E402
from scenelib import BOLD, label, render, tube  # noqa: E402

g = mocks.g
BEIGE = (0.90, 0.87, 0.78); BEIGE2 = (0.85, 0.82, 0.72); DARK = (0.05, 0.07, 0.06)
KEYS = [(0.86, 0.83, 0.73), (0.55, 0.62, 0.60), (0.92, 0.60, 0.33), (0.62, 0.70, 0.78), (0.78, 0.44, 0.40)]
METAL = (0.78, 0.79, 0.82); BRASS = (0.83, 0.68, 0.30); GREEN_PCB = (0.15, 0.55, 0.30); BLUE_PCB = (0.12, 0.30, 0.62)
WHITE_PART = (0.95, 0.95, 0.92); TEST_GREY = (0.8, 0.8, 0.84); TAPE_COL = (0.86, 0.30, 0.22)
RED, BLACK_WIRE, RIBBON = (0.85, 0.18, 0.15), (0.12, 0.12, 0.13), (0.93, 0.92, 0.88)
PI_COL = {"board": GREEN_PCB, "heatsink": (0.55, 0.57, 0.62), "sdcard": (0.2, 0.2, 0.25)}
S = (1300, 1200)


def mv(m, dx=0.0, dy=0.0, dz=0.0):
    m = m.copy(); m.apply_translation([dx, dy, dz]); return m


def persp(src, dst):
    A, B = [], []
    for (x, y), (X, Y) in zip(dst, src):
        A.append([x, y, 1, 0, 0, 0, -X * x, -X * y]); B.append(X)
        A.append([0, 0, 0, x, y, 1, -Y * x, -Y * y]); B.append(Y)
    return np.linalg.solve(np.array(A, float), np.array(B, float)).tolist()


def put_ui(img, proj, ui, dy=0.0, dz=0.0):
    """Paste an app screenshot on the picture area of the screen (seen through the window)."""
    vx, vz = g.screen_box(); vx += g.PIC_DX; vz += g.PIC_DZ; aw, ah = g.PIC_W / 2, g.PIC_H / 2; yf = g.y_glass() - 0.05 + dy; vz += dz
    dst = [proj(p) for p in [(vx - aw, yf, vz + ah), (vx + aw, yf, vz + ah), (vx + aw, yf, vz - ah), (vx - aw, yf, vz - ah)]]
    warped = ui.transform(img.size, Image.Transform.PERSPECTIVE, persp([(0, 0), (ui.width, 0), (ui.width, ui.height), (0, ui.height)], dst),
                          Image.Resampling.BICUBIC)
    mask = Image.new("L", img.size, 0); ImageDraw.Draw(mask).polygon([tuple(p) for p in dst], fill=255)
    img.paste(warped, (0, 0), mask)
    return img


def sheet(path, ims, titles, w):
    sh = Image.new("RGB", (w * len(ims), ims[0].height + 70), "white"); d = ImageDraw.Draw(sh)
    for i, (im, t) in enumerate(zip(ims, titles)):
        sh.paste(im, (i * w, 70)); d.text((i * w + 30, 20), t, fill=(30, 30, 30), font=BOLD)
    sh.save(path)
    print("saved", path)


def scene():
    asm, prn = g.build_all()
    body, mkeys, conn, plug = mocks.sd_module()
    keys = [(k, KEYS[i % 5]) for i, k in enumerate(mkeys)]
    scr = mocks.monitor_screen()
    parts = [(asm["PixelKeyboardBase"], BEIGE2), (asm["PixelKeyboardTop"], BEIGE), (body, (0.12, 0.13, 0.15)),
             (asm["PixelCase"], BEIGE), (asm["PixelCaseBottom"], BEIGE2), (asm["PixelStand"], BEIGE2),
             (asm["PixelMonitorFront"], BEIGE), (asm["PixelMonitorBack"], BEIGE), (scr["glass"], DARK), *keys]
    btn = mocks.power_button()
    extra = [(btn["button_head"], METAL)]
    if g.V2_PANEL:
        fp = mocks.front_parts()
        extra += [(m, METAL) for m in fp.values()]
        y0c = g.CASE_Y0
        extra += [(g.cyl_y(*g.TURBO_XZ, y0c - 4.0, y0c - 2.4, 9.0), (0.86, 0.86, 0.88))]
        for x, c in zip(g.LED3_X, [(0.2, 0.95, 0.35), (1.0, 0.62, 0.15)]):
            extra.append((g.cyl_y(x, g.LED3_Z, y0c - 4.5, y0c - 1.9, 3.0), c))
        extra.append((g.cyl_y(*g.LED5_XZ, y0c - 5.0, y0c - 1.9, 5.0), (0.3, 0.85, 1.0)))
        extra += [(g.kb_box(g.KB_LED_U[k] - 2.2, g.KB_LED_U[k] + 2.2, g.KB_LED_V - 0.9, g.KB_LED_V + 0.9, g.KB_TOP_T - 0.3, g.KB_TOP_T + 0.03),
                   [(0.2, 0.95, 0.35), (1.0, 0.62, 0.15), (0.2, 0.95, 0.35)][k]) for k in range(3)]
    return asm, prn, scr, parts + extra, (body, keys)


SCR_COL = {"pcb": BLUE_PCB, "rings": BRASS, "dsi_connector": (0.85, 0.80, 0.70), "power_connector": WHITE_PART,
           "backlight_switch": WHITE_PART, "pi_standoffs": BRASS, "ribbon_fold": RIBBON, "power_wires": RED}


def screen_back(scr):
    """Everything on the back of the screen (PCB, rings, connectors...), coloured."""
    return [(m, SCR_COL.get(k, BLUE_PCB)) for k, m in scr.items() if k not in ("glass", "tape")]


def wires(cx=None, cz=None, yg=None, to_pi=True):
    """Paths of the DSI ribbon and the two power wires, from the screen (to the Pi in the case)."""
    if cx is None:
        (cx, cz), yg = g.screen_box(), g.y_glass()
    z0 = g.MON_Z0
    yb = yg + g.SCR_T
    sp = mocks.scr_spots()
    x0s, x1s, y0s, y1s = g.RIBBON_SLOT; ys = (y0s + y1s) / 2
    dx, dz, dw = sp["dsi"][:3]
    a = np.array([cx + dx - dw / 2 - 12.0, yb + 11.0, cz + dz])
    pts = [a, (a[0] + 4, a[1] + 10, a[2] - 20)]
    pi_dsi = np.array([*g.pi_xy(3.1, 27.5), g.PLATE_T + g.PI_STANDOFF + 1.4 + 5.0])
    if to_pi:
        pts += [(-20, ys - 8, z0 + 16), (-3, ys - 3, z0 + 12), (-3, ys - 3, g.CASE_H - 6), (30, ys + 25, 32),
                (pi_dsi[0] - 6, pi_dsi[1], pi_dsi[2] + 10), pi_dsi]
    else:
        pts += [(a[0] + 8, a[1] + 16, a[2] - 45)]
    out = [(tube(pts, 1.2), RIBBON)]
    px_, pz_ = sp["pwr"][:2]
    for k, (p, c) in enumerate(zip(g.SCR_PWR_PINS, (RED, BLACK_WIRE))):
        w0 = np.array([cx + px_ - 1.0 + 2.0 * k, yb + 3.0, cz - g.SCR_H / 2 + 1.0])
        hx, hy = g.gpio_xy(p)
        b = np.array([*g.pi_xy(hx, hy), g.PLATE_T + g.PI_STANDOFF + 1.4 + 2.5 + g.DUPONT[1] + 2.0])
        pts = [w0, (w0[0], w0[1] + 8, w0[2] - 3)]
        if to_pi:
            pts += [(2.0 * k - 1, ys + 2, z0 + 11), (2.0 * k - 1, ys + 2, g.CASE_H - 6), (b[0] - 20, b[1] - 10, 36),
                    (b[0], b[1], b[2] + 12), b]
        else:
            pts += [(w0[0] + 3, w0[1] + 14, w0[2] - 25)]
        out.append((tube(pts, 0.75), c))
    return out


def pi_parts():
    out = []
    for k, m in mocks.pi_blocks().items():
        if k.startswith("plug_dupont"):
            out.append((m, (0.08, 0.08, 0.09)))
        elif k.startswith("plug"):
            out.append((m, (0.25, 0.25, 0.3)))
        else:
            out.append((m, PI_COL.get(k, (0.75, 0.76, 0.80))))
    return out


def clip(meshes, keep):
    """Keep what is inside the box mesh `keep` (cut-away views)."""
    out = []
    lo, hi = keep.bounds
    for m, c in meshes:
        if not (np.all(m.bounds[0] < hi) and np.all(m.bounds[1] > lo)):
            continue
        if np.all(m.bounds[0] >= lo) and np.all(m.bounds[1] <= hi):
            out.append((m, c)); continue
        try:
            mm = m.intersection(keep, engine="manifold")
        except Exception:  # noqa: BLE001  (open meshes such as cable tubes: keep the triangles inside)
            inside = np.all((m.triangles_center >= lo) & (m.triangles_center <= hi), axis=1)
            mm = m.submesh([np.nonzero(inside)[0]], append=True) if inside.any() else None
        if mm is not None and len(mm.faces):
            out.append((mm, c))
    return out


def cut(meshes, x_min):
    return clip(meshes, g.slab(x_min, 500, -500, 500, -500, 500))


def do_preview(out_dir, ui_dir):
    asm, prn, scr, parts, _ = scene()
    im1, p1 = render(parts, (0.52, 0.78, -0.34), S, light=(0.35, -0.65, 0.70))
    put_ui(im1, p1, Image.open(ui_dir / "moderne-mood-neutre.png").convert("RGB"))
    im2, p2 = render(parts, (-0.50, 0.80, -0.33), S, light=(-0.35, -0.65, 0.70))
    put_ui(im2, p2, Image.open(ui_dir / "manga-meteo.png").convert("RGB"))
    sheet(out_dir / "preview.png", [im1, im2], ["Pixel, thème Moderne : visage", "Pixel, thème Manga : météo"], S[0])


def do_inside(out_dir, ui_dir):
    asm, prn, scr, parts, (body, keys) = scene()
    back = screen_back(scr)
    ex = [(mv(asm["PixelCaseBottom"], dz=-30), BEIGE2), (asm["PixelCase"], BEIGE), (mv(asm["PixelStand"], dz=22), BEIGE2),
          (mv(asm["PixelMonitorFront"], dy=-34, dz=45), BEIGE), (mv(scr["glass"], dy=-14, dz=45), DARK),
          *[(mv(m, dy=-14, dz=45), c) for m, c in back],
          (mv(asm["PixelMonitorBack"], dy=55, dz=45), BEIGE),
          (mv(asm["PixelKeyboardBase"], dy=-30), BEIGE2), (mv(body, dy=-30, dz=22), (0.12, 0.13, 0.15)),
          *[(mv(k, dy=-30, dz=22), c) for k, c in keys], (mv(asm["PixelKeyboardTop"], dy=-30, dz=48), BEIGE)]
    ex += [(mv(m, dz=-30), c) for m, c in pi_parts()]
    im3, p3 = render(ex, (0.60, 0.72, -0.36), S, light=(0.35, -0.65, 0.70))

    btn = mocks.power_button()
    solids = [p for p in parts if p[0] is not scr["glass"]] + [(scr["glass"], DARK)] + back + \
        [(btn["button_body"], METAL), (btn["button_nut"], METAL), (btn["button_wires"], RED)]
    inside = pi_parts() + wires()
    xc = -60.0
    im4, p4 = render(cut(solids, xc) + cut([(m, c) for m, c in inside], xc), (0.88, 0.33, -0.34), S, light=(0.7, -0.3, 0.65))
    cx, cz = g.screen_box()
    x0s, x1s, y0s, y1s = g.RIBBON_SLOT
    label(im4, p4, (60, 225, 20), "Raspberry Pi 4", 120, 150, (30, 130, 60))
    label(im4, p4, (2, (y0s + y1s) / 2, g.CASE_H + 4), "Nappe de l'écran, 2 fils 5 V et GND\net 2 fils du bouton\ndans le pied", 160, -150, (200, 140, 30))
    label(im4, p4, (xc, g.y_glass() + 1, cz + 35), "Écran 7\" Freenove\n(carte bleue)", -60, -120, (40, 40, 40))
    bx, bz, _, _ = g.mon_btn()
    label(im4, p4, (bx, g.MON_F - 2, bz), "Bouton d'allumage 12 mm", 40, 160, (90, 90, 90))
    sp = mocks.scr_spots()
    label(im4, p4, (cx + sp["pwr"][0], g.y_pcb_back() + 6, cz + sp["pwr"][1]), "Prise blanche :\nfils 5 V et GND", -280, 80, (200, 50, 50))
    sheet(out_dir / "preview-inside.png", [im3, im4], ["Vue éclatée", "Vue en coupe : ce qu'il y a dedans"], S[0])


def do_print(out_dir):
    asm, prn, *_ = scene()
    layout = {"PixelCase": (0, 0), "PixelMonitorFront": (222, 0), "PixelStand": (420, 0),
              "PixelCaseBottom": (0, 175), "PixelKeyboardBase": (218, 175), "PixelKeyboardTop": (366, 175),
              "ScreenFitTest": (515, 175), "ScreenMountTest": (515, 300), "ScreenPostTest": (500, 20), "PixelMonitorBack": (230, 330)}
    tests = ("ScreenFitTest", "ScreenMountTest", "ScreenPostTest")
    plate = []
    for name, (x, y) in layout.items():
        m = prn[name].copy(); m.apply_translation([-m.bounds[0][0] + x, -m.bounds[0][1] + y, 0])
        plate.append((m, TEST_GREY if name in tests else BEIGE))
    im5, _ = render(plate, (0.35, 0.60, -0.72), (1300, 1100), light=(0.3, -0.5, 0.8))
    im5.save(out_dir / "preview-print.png")
    print("saved", out_dir / "preview-print.png")


def do_posts(out_dir):
    """The screen is held by the CRT back's 4 posts: the back seen from the front (left), and a cut through two
    posts with the screen in place (right)."""
    asm, _, scr, *_ = scene()
    cx, cz = g.screen_box()
    back = asm["PixelMonitorBack"]
    im1, p1 = render([(back, BEIGE)], (0.35, 0.88, -0.30), (1100, 900), light=(0.35, -0.65, 0.70))
    (hx, hz) = g.scr_holes(cx, cz)[3]
    c0, c1 = g.cup_y()
    label(im1, p1, (hx, c0, hz), "Poteau avec sa coupelle :\nelle se pose sur une bague", -420, -90, (150, 110, 30))
    x, ys = g.back_tabs()[0][0], g.back_screw_y()
    label(im1, p1, (g.back_tabs()[3][0], ys, g.MON_Z0 + g.WALL), "Vis du dessous\n(dans le cadre)", -330, 90, (90, 90, 90))

    xc = g.SCR_W / 2 - g.SCR_HOLE_IN
    keep = g.slab(cx + 58, cx + 100, -500, g.MON_F + g.BEZ_D + 22, hz - 14, hz)
    view = [(asm["PixelMonitorFront"], BEIGE), (back, BEIGE), (scr["glass"], DARK)] + screen_back(scr)
    im2, p2 = render(clip(view, keep), (-0.30, 0.45, -0.84), (1100, 900), light=(-0.3, -0.4, 0.86), pad=60)
    yb = g.y_pcb_back()
    label(im2, p2, (cx + xc, c1, hz), "Le poteau appuie\nsur la bague en laiton", 60, -220, (150, 110, 30))
    label(im2, p2, (cx + 62, g.y_glass() + 1, hz), "Vitre posée sur\nle bord de la fenêtre", 120, 260, (40, 40, 40))
    label(im2, p2, (cx + 62, yb - 0.5, hz), "Carte bleue", -120, -150, (30, 60, 140))
    sheet(out_dir / "preview-posts.png", [im1, im2], ["L'arrière du moniteur : 4 poteaux", "En coupe : l'écran tenu entre le cadre et les poteaux"], 1100)


def do_sdtest(out_dir):
    """The Stream Deck fit test: as printed, and pressed onto the bare module (keys through the windows)."""
    _, prn, *_ = scene()
    im1, _ = render([(prn["StreamDeckFitTest"], (0.8, 0.8, 0.84))], (0.35, 0.60, -0.72), (1100, 900), light=(0.3, -0.5, 0.8), pad=80)
    body, mkeys, _, _ = mocks.sd_module()
    test = g.kb_local(g.build_sd_fit_test())
    on = [(test, (0.8, 0.8, 0.84)), (body, (0.12, 0.13, 0.15))] + [(k, KEYS[i % 5]) for i, k in enumerate(mkeys)]
    im2, p2 = render(on, (0.45, 0.80, -0.40), (1100, 900), light=(0.35, -0.65, 0.70), pad=80)
    u0, u1, v0, v1 = g.mod_pocket()
    label(im2, p2, tuple(g.kb_world(u0 - g.SDTEST_RIM / 2, (v0 + v1) / 2, -g.MOD_DEPTH / 2)), "Bord du logement\n(comme le socle)",
          40, 230, (60, 60, 60))
    u, v = g.module_uv(g.MOD_KEY_X[-1], g.MOD_KEY_Y[0])
    label(im2, p2, tuple(g.kb_world(u, v, 3.0)), "15 touches dans\nles vraies fenêtres", 60, -170, (180, 90, 40))
    sheet(out_dir / "preview-sdtest.png", [im1, im2], ["StreamDeckFitTest, à plat comme imprimé", "Posé sur le module du Stream Deck"], 1100)


def do_v2(out_dir):
    old = g.V2_PANEL
    g.V2_PANEL = True
    try:
        asm, prn, scr, parts, _ = scene()
        near = clip(parts, g.slab(-60, 120, -10, 160, -1, g.CASE_H - 0.05))
        im, p = render(near, (-0.40, 0.84, -0.36), (1300, 900), light=(-0.35, -0.65, 0.70))
        label(im, p, (g.TURBO_XZ[0], g.CASE_Y0 - 3, g.TURBO_XZ[1] + 6), "Turbo 12 mm", -120, -170, (60, 60, 60))
        label(im, p, (g.LED5_XZ[0], g.CASE_Y0 - 3, g.LED5_XZ[1] + 3), "LED RVB", -180, -110, (40, 120, 200))
        label(im, p, (g.LED3_X[0], g.CASE_Y0 - 3, g.LED3_Z + 2), "2 voyants 3 mm", -260, -40, (200, 120, 30))
        label(im, p, tuple(g.kb_world(g.KB_LED_U[1], g.KB_LED_V, g.KB_TOP_T)), "3 LED du ruban\nsous des fenêtres", 120, 90, (40, 140, 60))
        sheet(out_dir / "preview-v2.png", [im], ["v2 : vrais boutons et vrais voyants (option)"], 1300)
    finally:
        g.V2_PANEL = old


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ui", type=Path, default=HERE / "ui", help="folder with the app screenshots")
    ap.add_argument("--out", type=Path, default=HERE.parent, help="where to write the PNG files")
    ap.add_argument("--only", choices=["preview", "inside", "print", "posts", "sdtest", "v2"])
    a = ap.parse_args()
    a.out.mkdir(parents=True, exist_ok=True)
    jobs = {"preview": lambda: do_preview(a.out, a.ui), "inside": lambda: do_inside(a.out, a.ui), "print": lambda: do_print(a.out),
            "posts": lambda: do_posts(a.out), "sdtest": lambda: do_sdtest(a.out), "v2": lambda: do_v2(a.out)}
    for k, job in jobs.items():
        if a.only in (None, k):
            job()


if __name__ == "__main__":
    main()
