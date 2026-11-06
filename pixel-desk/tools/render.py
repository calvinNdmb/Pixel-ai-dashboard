"""Pictures for the README, from the same model as the STL files.

    python3 tools/render.py                    # all pictures into pixel-desk/
    python3 tools/render.py --only adapter     # one picture: preview, inside, print, adapter, v2
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
METAL = (0.78, 0.79, 0.82); BRASS = (0.83, 0.68, 0.30); GREEN_PCB = (0.15, 0.55, 0.30); LCD_GREY = (0.70, 0.72, 0.74)
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
    vx, vz = g.view_centre(); aw, ah = g.ACTIVE_W / 2, g.ACTIVE_H / 2; yf = g.y_glass() - 0.05 + dy; vz += dz
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
    scr = mocks.screen_parts()
    adp = mocks.adapter_parts()
    parts = [(asm["PixelKeyboardBase"], BEIGE2), (asm["PixelKeyboardTop"], BEIGE), (body, (0.12, 0.13, 0.15)),
             (asm["PixelCase"], BEIGE), (asm["PixelCaseBottom"], BEIGE2), (asm["PixelStand"], BEIGE2),
             (asm["PixelMonitorFront"], BEIGE), (asm["PixelMonitorBack"], BEIGE), (scr["glass"], DARK), *keys]
    extra = []
    if g.V2_PANEL:
        fp = mocks.front_parts()
        extra += [(m, METAL) for m in fp.values()]
        y0c = g.CASE_Y0; px_, pz_ = g.PWR_XZ
        glow = g.D(g.cyl_y(px_, pz_, y0c - 3.3, y0c - 2.95, 18.0), g.cyl_y(px_, pz_, y0c - 4, y0c - 2, 15.2))
        extra += [(glow, (0.2, 0.95, 0.35)), (g.cyl_y(*g.TURBO_XZ, y0c - 4.0, y0c - 2.4, 9.0), (0.86, 0.86, 0.88))]
        for x, c in zip(g.LED3_X, [(0.2, 0.95, 0.35), (1.0, 0.62, 0.15)]):
            extra.append((g.cyl_y(x, g.LED3_Z, y0c - 4.5, y0c - 1.9, 3.0), c))
        extra.append((g.cyl_y(*g.LED5_XZ, y0c - 5.0, y0c - 1.9, 5.0), (0.3, 0.85, 1.0)))
        extra += [(g.kb_box(g.KB_LED_U[k] - 2.2, g.KB_LED_U[k] + 2.2, g.KB_LED_V - 0.9, g.KB_LED_V + 0.9, g.KB_TOP_T - 0.3, g.KB_TOP_T + 0.03),
                   [(0.2, 0.95, 0.35), (1.0, 0.62, 0.15), (0.2, 0.95, 0.35)][k]) for k in range(3)]
    return asm, prn, scr, adp, parts + extra, (body, keys)


def screen_back(scr, adp, asm):
    """Everything on the back of the screen, coloured."""
    col = {"lcd": LCD_GREY, "driver_board": GREEN_PCB, "drv_feet": LCD_GREY, "standoffs": BRASS, "pogo_pins": BRASS,
           "dsi_connector": (0.93, 0.93, 0.90), "power_jst": (0.95, 0.95, 0.92), "ribbon_exit": RIBBON, "ribbon_down": RIBBON,
           "touch_fpc": (0.90, 0.55, 0.15)}
    out = [(m, col.get(k, LCD_GREY)) for k, m in scr.items() if k != "glass"]
    out += [(adp["header_body"], (0.10, 0.10, 0.11)), (adp["header_pins"], (0.85, 0.75, 0.40))]
    pins = list(g.POGO_PINS)
    for p, c in zip(pins, (RED, BLACK_WIRE)):
        x, y = g.gpio_xy(p)
        s = 2.5
        top = g.HDR_TAIL - g.PIN_BELOW + g.HDR_BODY_H
        out.append((mocks.pi_box(x - s / 2, x + s / 2, y - s / 2, y + s / 2, top + 0.01, top + g.DUPONT[1]), (0.08, 0.08, 0.09)))
        out.append((mocks.pi_cyl(x, y, top + g.DUPONT[1], top + g.DUPONT[1] + 4.0, 1.6), c))
    out.append((asm["PixelScreenPowerAdapter"], BEIGE))
    return out


def wires():
    """Paths of the DSI ribbon and the two power wires, from the screen to the Pi."""
    cx, cz = g.screen_box(); z0 = g.MON_Z0
    x0s, x1s, y0s, y1s = g.RIBBON_SLOT; ys = (y0s + y1s) / 2
    p_fold = g.pi_world(-14.0, 27.6, -g.STANDOFF_H + 1.0)
    low = cz - g.SCR_H / 2 + 2.0
    pi_dsi = np.array([*g.pi_xy(3.1, 27.5), g.PLATE_T + g.PI_STANDOFF + 1.4 + 5.0])
    ffc = tube([p_fold, (p_fold[0], p_fold[1] + 1, low + 6), (p_fold[0] + 8, g.MON_F + g.BEZ_D + 4, low),
                (-30, g.MON_F + g.BEZ_D + 14, z0 + 13), (-3, ys - 3, z0 + 12), (-3, ys - 3, g.CASE_H - 6),
                (30, ys + 25, 32), (pi_dsi[0] - 6, pi_dsi[1], pi_dsi[2] + 10), pi_dsi], 1.2)
    out = [(ffc, (0.95, 0.70, 0.25))]
    for k, (p, c) in enumerate(zip(g.POGO_PINS, (RED, BLACK_WIRE))):
        top = g.HDR_TAIL - g.PIN_BELOW + g.HDR_BODY_H + g.DUPONT[1] + 3.0
        a = g.pi_world(*g.gpio_xy(p), top)
        hx, hy = g.gpio_xy(p)
        b = np.array([*g.pi_xy(hx, hy), g.PLATE_T + g.PI_STANDOFF + 1.4 + 2.5 + g.DUPONT[1] + 2.0])
        dx = 2.0 * k
        w = tube([a, (a[0], a[1] + 14, a[2] - 6), (a[0] + 10, a[1] + 24, z0 + 16), (dx - 1, ys + 2, z0 + 11),
                  (dx - 1, ys + 2, g.CASE_H - 6), (b[0] - 20, b[1] - 10, 36), (b[0], b[1], b[2] + 12), b], 0.75)
        out.append((w, c))
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
    asm, prn, scr, adp, parts, _ = scene()
    im1, p1 = render(parts, (0.52, 0.78, -0.34), S, light=(0.35, -0.65, 0.70))
    put_ui(im1, p1, Image.open(ui_dir / "moderne-mood-neutre.png").convert("RGB"))
    im2, p2 = render(parts, (-0.50, 0.80, -0.33), S, light=(-0.35, -0.65, 0.70))
    put_ui(im2, p2, Image.open(ui_dir / "manga-meteo.png").convert("RGB"))
    sheet(out_dir / "preview.png", [im1, im2], ["Pixel, thème Moderne : visage", "Pixel, thème Manga : météo"], S[0])


def do_inside(out_dir, ui_dir):
    asm, prn, scr, adp, parts, (body, keys) = scene()
    back = screen_back(scr, adp, asm)
    ex = [(mv(asm["PixelCaseBottom"], dz=-30), BEIGE2), (asm["PixelCase"], BEIGE), (mv(asm["PixelStand"], dz=22), BEIGE2),
          (mv(asm["PixelMonitorFront"], dy=-34, dz=45), BEIGE), (mv(scr["glass"], dy=-14, dz=45), DARK),
          *[(mv(m, dy=-14, dz=45), c) for m, c in back if m is not asm["PixelScreenPowerAdapter"]],
          (mv(asm["PixelScreenPowerAdapter"], dy=10, dz=45), BEIGE), (mv(asm["PixelMonitorBack"], dy=55, dz=45), BEIGE),
          (mv(asm["PixelKeyboardBase"], dy=-30), BEIGE2), (mv(body, dy=-30, dz=22), (0.12, 0.13, 0.15)),
          *[(mv(k, dy=-30, dz=22), c) for k, c in keys], (mv(asm["PixelKeyboardTop"], dy=-30, dz=48), BEIGE)]
    ex += [(mv(m, dz=-30), c) for m, c in pi_parts()]
    im3, p3 = render(ex, (0.60, 0.72, -0.36), S, light=(0.35, -0.65, 0.70))

    solids = [p for p in parts if p[0] is not scr["glass"]] + [(scr["glass"], DARK)] + back
    inside = pi_parts() + wires()
    xc = -30.0
    im4, p4 = render(cut(solids, xc) + cut([(m, c) for m, c in inside], xc), (0.88, 0.33, -0.34), S, light=(0.7, -0.3, 0.65))
    cx, cz = g.screen_box()
    x0s, x1s, y0s, y1s = g.RIBBON_SLOT
    label(im4, p4, (60, 225, 20), "Raspberry Pi 4", 120, 150, (30, 130, 60))
    label(im4, p4, (2, (y0s + y1s) / 2, g.CASE_H + 4), "Nappe de l'écran\n+ 2 fils 5 V et GND\ndans le pied", 160, -150, (200, 140, 30))
    label(im4, p4, (xc, g.y_glass() + 1, cz + 35), "Écran 7\" Freenove", -60, -120, (40, 40, 40))
    label(im4, p4, tuple(g.pi_world(40, 10, g.ADP_T)), "Plaque « faux Pi »", -260, 40, (150, 120, 40))
    label(im4, p4, tuple(g.pi_world(*g.gpio_xy(g.POGO_PINS[0]), g.ADP_T + 8)), "Fils 5 V et GND\nsur ses broches", -260, 60, (200, 50, 50))
    sheet(out_dir / "preview-inside.png", [im3, im4], ["Vue éclatée", "Vue en coupe : ce qu'il y a dedans"], S[0])


def do_print(out_dir):
    asm, prn, *_ = scene()
    layout = {"PixelCase": (0, 0), "PixelMonitorFront": (222, 0), "PixelScreenPowerAdapter": (442, 0), "PixelStand": (525, 0),
              "PixelCaseBottom": (0, 175), "PixelKeyboardBase": (218, 175), "PixelKeyboardTop": (366, 175),
              "ScreenFitTest": (515, 175), "PixelMonitorBack": (230, 330)}
    plate = []
    for name, (x, y) in layout.items():
        m = prn[name].copy(); m.apply_translation([-m.bounds[0][0] + x, -m.bounds[0][1] + y, 0])
        plate.append((m, (0.8, 0.8, 0.84) if name == "ScreenFitTest" else BEIGE))
    im5, _ = render(plate, (0.35, 0.60, -0.72), (1300, 1100), light=(0.3, -0.5, 0.8))
    im5.save(out_dir / "preview-print.png")
    print("saved", out_dir / "preview-print.png")


def dupont_wires(length=45.0):
    """The two Dupont wires leaving the faux Pi and going down the back of the screen."""
    out = []
    top = g.HDR_TAIL - g.PIN_BELOW + g.HDR_BODY_H + g.DUPONT[1]
    for k, (p, c) in enumerate(zip(g.POGO_PINS, (RED, BLACK_WIRE))):
        a = g.pi_world(*g.gpio_xy(p), top)
        out.append((tube([a, (a[0], a[1] + 6, a[2] - 2), (a[0] + 2 * k, a[1] + 9, a[2] - 14),
                          (a[0] + 2 * k + 4, a[1] + 10, a[2] - length)], 0.8), c))
    return out


def do_adapter(out_dir):
    asm, prn, scr, adp, *_ = scene()
    back = screen_back(scr, adp, asm)
    view = [(scr["glass"], DARK)] + back + dupont_wires()
    # left: the screen's back with the faux Pi and the two wires (seen from behind, top edge up)
    im1, p1 = render(view, (-0.30, -0.93, -0.22), (1100, 900), light=(-0.3, 0.8, 0.6))
    label(im1, p1, tuple(g.pi_world(45, 40, g.ADP_T)), "Plaque « faux Pi »\n(imprimée)", -260, -170, (150, 120, 40))
    label(im1, p1, tuple(g.pi_world(61.5, 3.5, g.ADP_T)), "4 vis M2,5 × 6 dans\nles entretoises de l'écran", 150, -200, (130, 100, 30))
    label(im1, p1, tuple(g.pi_world(14, 52.5, g.ADP_T + 4)), "Morceau de barrette\nmâle 2 × 5", -330, 150, (40, 40, 40))
    w0 = dupont_wires()[0][0]
    label(im1, p1, tuple(w0.vertices[len(w0.vertices) // 2]), "Fil rouge : 5 V\nFil noir : GND", -120, 210, (200, 50, 50))
    rd = scr["ribbon_down"]
    label(im1, p1, (rd.bounds[0][0] + 8, rd.bounds[0][1], rd.bounds[0][2] + 30), "Nappe vers le Pi", 20, 170, (170, 130, 40))

    # right: profile cut along the board-edge row of pins (4 and 6): the screen's springs touch the short ends
    x4, y4 = g.gpio_xy(g.POGO_PINS[0])
    z_row = g.pi_world(x4, y4)[2]
    hdr = g.header_box()
    xa, xb = g.pi_world(hdr[0] - 7, y4)[0], g.pi_world(hdr[1] + 6, y4)[0]
    y_lo, y_hi = g.y_lcd_back() - 1.5, g.y_pi() + g.ADP_T + g.DUPONT[1] + 6
    keep = g.slab(min(xa, xb), max(xa, xb), y_lo, y_hi, z_row - 12, z_row)
    sect = []
    for m, c in back + dupont_wires(30.0):
        if not (np.all(m.bounds[0] < keep.bounds[1]) and np.all(m.bounds[1] > keep.bounds[0])):
            continue
        try:
            mm = m.intersection(keep, engine="manifold")
        except Exception:  # noqa: BLE001
            inside = np.all((m.triangles_center >= keep.bounds[0]) & (m.triangles_center <= keep.bounds[1]), axis=1)
            mm = m.submesh([np.nonzero(inside)[0]], append=True) if inside.any() else None
        if mm is not None and len(mm.faces):
            sect.append((mm, c))
    im2, p2 = render(sect, (0.10, 0.32, -0.94), (1100, 900), light=(0.3, 0.4, 0.86), pad=60)
    wt = g.HDR_TAIL - g.PIN_BELOW
    label(im2, p2, tuple(g.pi_world(x4, y4, -g.PIN_BELOW - 2.0)), "Ressort de l'écran (5 V)\nsous la broche 4", -200, 170, (150, 110, 20))
    label(im2, p2, tuple(g.pi_world(gpio6 := g.gpio_xy(g.POGO_PINS[1])[0], y4, -g.PIN_BELOW - 2.0)), "Ressort GND\nsous la broche 6", 150, 190, (90, 90, 90))
    label(im2, p2, tuple(g.pi_world(hdr[1] + 3.0, y4, g.ADP_T - 1.5)), "Plaque « faux Pi »", 140, 40, (150, 120, 40))
    label(im2, p2, tuple(g.pi_world(x4, y4, g.ADP_T + 9)), "Prises Dupont\n(fils vers le Pi)", 160, -230, (40, 40, 40))
    label(im2, p2, tuple(g.pi_world(hdr[0] + 1, y4, wt + 1.2)), "Corps de la barrette,\nenfoncé jusqu'au fond", -40, 170, (40, 40, 40))
    label(im2, p2, tuple(g.pi_world(2.0, y4, -g.STANDOFF_H - g.DRV_T / 2)), "Carte de l'écran", -30, 150, (30, 120, 60))
    label(im2, p2, tuple(g.pi_world(gpio6 + 6, y4, -g.PIN_BELOW / 2)), f"Les broches dépassent\nde {g.PIN_BELOW:.1f} mm dessous".replace(".", ","), 160, -150, (60, 60, 60))
    sheet(out_dir / "preview-adapter.png", [im1, im2], ["Le « faux Pi » au dos de l'écran", "En coupe : les ressorts de l'écran touchent les broches"], 1100)


def do_v2(out_dir):
    old = g.V2_PANEL
    g.V2_PANEL = True
    try:
        asm, prn, scr, adp, parts, _ = scene()
        near = clip(parts, g.slab(-60, 120, -10, 160, -1, g.CASE_H - 0.05))
        im, p = render(near, (-0.40, 0.84, -0.36), (1300, 900), light=(-0.35, -0.65, 0.70))
        label(im, p, (g.PWR_XZ[0], g.CASE_Y0 - 3, g.PWR_XZ[1] + 8), "Bouton d'allumage 16 mm", 20, -150, (40, 140, 60))
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
    ap.add_argument("--only", choices=["preview", "inside", "print", "adapter", "v2"])
    a = ap.parse_args()
    a.out.mkdir(parents=True, exist_ok=True)
    jobs = {"preview": lambda: do_preview(a.out, a.ui), "inside": lambda: do_inside(a.out, a.ui), "print": lambda: do_print(a.out),
            "adapter": lambda: do_adapter(a.out), "v2": lambda: do_v2(a.out)}
    for k, job in jobs.items():
        if a.only in (None, k):
            job()


if __name__ == "__main__":
    main()
