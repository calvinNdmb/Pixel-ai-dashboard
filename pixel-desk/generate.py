"""Pixel, retro edition: a beige 90s desktop PC that is really a Raspberry Pi 4.

- The "CRT monitor" holds a 4.3" touch screen (Waveshare 4.3inch DSI LCD).
- The "desktop case" holds the Raspberry Pi 4, the speaker and the wiring.
- The "keyboard" is a Stream Deck MK.2 lying on a low tray in front.
No moving parts. One cable: the Pi's USB-C power.

Parts (stl/), each exported in its print orientation, no supports needed:
    PixelMonitorFront.stl  bezel that holds the screen (prints face-down)
    PixelMonitorBack.stl   tapered CRT back with vents (prints back-down)
    PixelStand.stl         round swivel foot under the monitor (prints top-down)
    PixelCase.stl          desktop case shell (prints top-down)
    PixelCaseBottom.stl    bottom plate, the Pi is screwed on it (prints flat)
    PixelKeyboardTray.stl  low tray for the Stream Deck (prints upright)
    ScreenFitTest.stl      thin frame to check the screen size before the big prints

    pip install trimesh manifold3d shapely mapbox_earcut numpy scipy matplotlib
    python generate.py

Coordinates: X = left/right, Y = front (0) to back, Z = up. Units: mm.
"""

from math import cos, radians, sin, tan
from pathlib import Path

import numpy as np
import trimesh
from shapely import affinity
from shapely.geometry import Point, Polygon, box
from shapely.ops import unary_union

OUT = Path(__file__).parent / "stl"

# ------------------------------------------------------------------ bought parts
SD_W, SD_H, SD_T = 118.0, 84.0, 25.0            # Stream Deck MK.2, stand removed
SD_ANGLE = 7.0                                  # keyboard-like tilt
SD_CLR = 0.75

# Waveshare 4.3inch DSI LCD (SKU 16239), outline from retailer data: measure yours
# and print ScreenFitTest.stl first.
SCR_W, SCR_H, SCR_T = 106.0, 68.0, 14.05
SCR_CLR = 0.3
WIN_W, WIN_H, WIN_R = 101.0, 63.0, 2.0          # visible window
ACTIVE_W, ACTIVE_H = 95.04, 53.86               # for previews only

PI_L, PI_W = 85.0, 56.0                         # Raspberry Pi 4 board
PI_HOLES = [(3.5, 3.5), (61.5, 3.5), (3.5, 52.5), (61.5, 52.5)]
PI_STANDOFF = 5.0
SPK_D, SPK_H = 40.0, 18.0                       # 40 mm speaker

# ------------------------------------------------------------------ layout
WALL = 2.4
PILOT, CLEAR = 2.2, 2.8                         # M2.5 self-tapping pilot / clearance
CBORE_D, CBORE_H = 5.0, 1.8
OVER = 0.01

# keyboard tray (front)
TRAY_HW, TRAY_D, TRAY_R = 68.0, 94.0, 6.0
TRAY_Z_FRONT = 8.0                              # room under the deck for a 90 deg USB-C plug
POCKET_DEPTH = 5.0
POCKET_S0 = 4.5                                 # front rim, measured along the slope

# desktop case
CASE_HW, CASE_Y0, CASE_D, CASE_H = 75.0, 94.5, 130.0, 58.0
CASE_Y1 = CASE_Y0 + CASE_D
CASE_R, CASE_CHAMFER = 4.0, 2.0
PLATE_T = 2.4
PI_X0 = 58.0                                    # X of the Pi's SD-card edge (board rotated 180 deg)
PI_Y0 = CASE_Y1 - WALL - 2.2                    # Y of the Pi's USB-C edge (audio jack clears the wall)
SPK_XY = (45.0, 120.0)
TRAY_SCREWS_X = 45.0
TRAY_SCREW_Z = 8.0

# stand (swivel foot)
STAND_R, STAND_H, STAND_CHAMFER = 32.0, 10.0, 3.0
STAND_Y = 132.0
STAND_CASE_SCREWS = [(0, 24.0), (0, -24.0), (26.0, 0), (-26.0, 0)]   # relative to the stand centre
STAND_MON_SCREWS = [(-18.0, -9.0), (18.0, -9.0), (-18.0, 9.0), (18.0, 9.0)]

# monitor
MON_F = STAND_Y - 20.0                          # front face of the bezel
MON_Z0 = CASE_H + STAND_H                       # bottom of the monitor
BEZ_W, BEZ_H, BEZ_D, BEZ_R, BEZ_CHAMFER = 128.0, 98.0, 20.0, 5.0, 1.5
FUNNEL = 5.0                                    # sunken screen: 45 deg funnel depth
SCR_BOTTOM = 18.0                               # screen bottom above the monitor's bottom
BACK_FRONT_W, BACK_FRONT_H = 118.0, 92.0                 # deep, boxy CRT back
BACK_W, BACK_H, BACK_D, BACK_R = 100.0, 78.0, 95.0, 6.0


# ------------------------------------------------------------------ helpers
def rrect(w, h, r, cx=0.0, cy=0.0):
    r = min(r, w / 2 - 0.01, h / 2 - 0.01)
    if r <= 0.02:
        return box(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2)
    return box(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2).buffer(-r).buffer(r, quad_segs=16)


def ext_xy(poly, z0, z1):
    m = trimesh.creation.extrude_polygon(poly, z1 - z0)
    m.apply_translation([0, 0, z0])
    return m


def ext_yz(poly, x0, x1):
    """Profile drawn in (Y, Z), extruded across X."""
    m = trimesh.creation.extrude_polygon(poly, x1 - x0)
    m.apply_transform(np.array([[0, 0, 1, x0], [1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 0, 1]], float))
    return m


def ext_xz(poly, y0, y1):
    """Profile drawn in (X, Z), extruded along Y from y0 to y1."""
    m = trimesh.creation.extrude_polygon(poly, y1 - y0)
    m.apply_transform(np.array([[1, 0, 0, 0], [0, 0, -1, y1], [0, 1, 0, 0], [0, 0, 0, 1]], float))
    return m


def ext_yz_side(poly, x0, x1):
    return ext_yz(poly, x0, x1)


def slab(x0, x1, y0, y1, z0, z1):
    b = trimesh.creation.box(extents=[x1 - x0, y1 - y0, z1 - z0])
    b.apply_translation([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2])
    return b


def cyl(x, y, z0, z1, d, sections=40):
    c = trimesh.creation.cylinder(radius=d / 2, height=z1 - z0, sections=sections)
    c.apply_translation([x, y, (z0 + z1) / 2])
    return c


def cyl_y(x, z, y0, y1, d, sections=40):
    c = trimesh.creation.cylinder(radius=d / 2, height=y1 - y0, sections=sections)
    c.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [1, 0, 0]))
    c.apply_translation([x, (y0 + y1) / 2, z])
    return c


def U(ms):
    ms = [m for m in ms if m is not None]
    return trimesh.boolean.union(ms, engine="manifold") if len(ms) > 1 else ms[0]


def D(a, *bs):
    bs = [b for b in bs if b is not None]
    return a.difference(U(bs), engine="manifold") if bs else a


def I(a, b):
    return a.intersection(b, engine="manifold")


def hull(*meshes):
    return trimesh.convex.convex_hull(np.vstack([m.vertices for m in meshes]))


def chamfer_top(core, c):
    """Minkowski sum with a cone: 45 deg chamfer on top edges, rounded vertical edges, flat bottom."""
    k = np.linspace(0, 2 * np.pi, 32, endpoint=False)
    cone = np.vstack([np.c_[c * np.cos(k), c * np.sin(k), np.zeros_like(k)], [[0, 0, c]]])
    P = core.vertices[:, None, :] + cone[None, :, :]
    return trimesh.convex.convex_hull(P.reshape(-1, 3))


def single(mesh, name):
    with np.errstate(all="ignore"):
        pieces = [p for p in mesh.split(only_watertight=False) if abs(p.volume) > 1.0]
    assert len(pieces) == 1, f"{name}: {len(pieces)} pieces"
    m = pieces[0]
    assert m.is_watertight and m.volume > 0, name
    return m


def text_poly(txt, size, x, y):
    """Bold text outline as a shapely geometry, bottom-left at (x, y)."""
    from matplotlib.font_manager import FontProperties
    from matplotlib.textpath import TextPath
    tp = TextPath((0, 0), txt, size=size, prop=FontProperties(family="DejaVu Sans", weight="bold"))
    geom = Polygon()
    for ring in tp.to_polygons():
        if len(ring) >= 3:
            geom = geom.symmetric_difference(Polygon(ring).buffer(0))
    return affinity.translate(geom, x, y)


def ring(cx, cy, d_out, d_in):
    return Point(cx, cy).buffer(d_out / 2, quad_segs=24).difference(Point(cx, cy).buffer(d_in / 2, quad_segs=24))


def engrave_front(poly_xz, y_face, depth):
    """Engrave a shape drawn in (X, Z) into a face that looks towards -Y at y = y_face."""
    parts = [g for g in getattr(poly_xz, "geoms", [poly_xz]) if g.area > 0.01]
    return U([ext_xz(g, y_face - 1.0, y_face + depth) for g in parts])


# ------------------------------------------------------------------ keyboard tray
def deck_pose():
    a = radians(SD_ANGLE)
    u = np.array([cos(a), sin(a)])                 # up the slope (Y, Z)
    n = np.array([-sin(a), cos(a)])                # out of the keys
    top = lambda s: np.array([s * cos(a), TRAY_Z_FRONT + s * sin(a)])
    s0, s1 = POCKET_S0, POCKET_S0 + SD_H + 2 * SD_CLR
    floor0 = top(s0) - POCKET_DEPTH * n            # pocket floor, front end
    return dict(u=u, n=n, top=top, s0=s0, s1=s1, floor0=floor0,
                deck0=floor0 + SD_CLR * u)          # Stream Deck back-bottom corner


def build_tray():
    a = radians(SD_ANGLE)
    z_back = TRAY_Z_FRONT + TRAY_D * tan(a)
    prof = Polygon([(0, 0), (0, TRAY_Z_FRONT), (TRAY_D, z_back), (TRAY_D, 0)])
    plan = rrect(2 * TRAY_HW, TRAY_D, TRAY_R, 0, TRAY_D / 2)
    tray = I(ext_xy(plan, 0, 40), ext_yz(prof, -200, 200))
    dp = deck_pose()
    top, n = dp["top"], dp["n"]
    pk = Polygon([tuple(top(dp["s0"]) - POCKET_DEPTH * n), tuple(top(dp["s1"]) - POCKET_DEPTH * n),
                  tuple(top(dp["s1"]) + 40 * n), tuple(top(dp["s0"]) + 40 * n)])
    hw = SD_W / 2 + SD_CLR
    cuts = [ext_yz(pk, -hw, hw)]
    # pocket for the Stream Deck's USB-C plug, and a tunnel to the back into the case
    cuts.append(slab(-20, 20, 64, top(dp["s1"])[0] - 1.0, 3.0, 40))
    cuts.append(slab(-7, 7, 70, TRAY_D + 1, 3.0, 13.0))
    # pilots for the two screws coming from inside the case
    for s in (-1, 1):
        cuts.append(cyl_y(s * TRAY_SCREWS_X, TRAY_SCREW_Z, TRAY_D - 12, TRAY_D + 1, PILOT))
    # rubber feet
    for x, y in ((-52, 14), (52, 14), (-52, 80), (52, 80)):
        cuts.append(cyl(x, y, -1, 1.0, 10.5))
    return single(D(tray, *cuts), "PixelKeyboardTray")


# ------------------------------------------------------------------ desktop case
def pi_xy(hx, hy):
    """Pi board coordinates (x from the SD-card edge, y from the USB-C edge) -> case X, Y."""
    return PI_X0 - hx, PI_Y0 - hy


def case_inner_box():
    return (-CASE_HW + WALL, CASE_HW - WALL, CASE_Y0 + WALL, CASE_Y1 - WALL)


def plate_screws():
    x0, x1, y0, y1 = case_inner_box()
    return [(x0 + 6.6, y0 + 6.6), (x1 - 6.6, y0 + 6.6), (x0 + 6.6, y1 - 6.6), (x1 - 6.6, y1 - 6.6)]


def build_case():
    c = CASE_CHAMFER
    core = ext_xy(rrect(2 * CASE_HW - 2 * c, CASE_D - 2 * c, CASE_R - c, 0, CASE_Y0 + CASE_D / 2), 0, CASE_H - c)
    shell = chamfer_top(core, c)
    x0, x1, y0, y1 = case_inner_box()
    shell = D(shell, slab(x0, x1, y0, y1, -1, CASE_H - WALL))
    adds = []
    for x, y in plate_screws():                                      # bottom plate screws
        adds.append(cyl(x, y, PLATE_T, CASE_H - WALL + OVER, 8.0))
    sx, sy = SPK_XY                                                  # speaker ring
    adds.append(ext_xy(ring(sx, sy, SPK_D + 4.4, SPK_D + 0.6), CASE_H - WALL - 4, CASE_H - WALL + OVER))
    for s in (-1, 1):                                                # bosses for the tray screws
        adds.append(slab(s * TRAY_SCREWS_X - 4, s * TRAY_SCREWS_X + 4, y0 - OVER, y0 + 3, PLATE_T + 0.5, 14))
    case = U([shell, *adds])

    cuts = []
    for x, y in plate_screws():
        cuts.append(cyl(x, y, PLATE_T - 1, PLATE_T + 10, PILOT))
    # stand screws (from inside, up into the stand) and the screen ribbon hole
    for dx, dy in STAND_CASE_SCREWS:
        cuts.append(cyl(dx, STAND_Y + dy, CASE_H - WALL - 1, CASE_H + 1, CLEAR))
    cuts.append(slab(-10, 10, STAND_Y - 2, STAND_Y + 9, CASE_H - WALL - 1, CASE_H + 1))
    # speaker slots in the top
    for k in range(6):
        y = sy - 13 + 5.2 * k
        cuts.append(slab(sx - 15, sx + 15, y, y + 2.2, CASE_H - WALL - 1, CASE_H + 1))
    # tray screws + Stream Deck cable through the front wall
    for s in (-1, 1):
        cuts.append(cyl_y(s * TRAY_SCREWS_X, TRAY_SCREW_Z, CASE_Y0 - 1, y0 + 4, CLEAR))
    cuts.append(slab(-7, 7, CASE_Y0 - 1, y0 + 1, 3.0, 13.0))
    # Pi USB-C power through the back wall
    ux, _ = pi_xy(11.2, 0)
    uz = PLATE_T + PI_STANDOFF + 1.4 + 1.6
    cuts.append(slab(ux - 6.8, ux + 6.8, y1 - 1, CASE_Y1 + 1, uz - 4.2, uz + 4.2))
    # "power supply fan" on the back: a circle of small holes
    for r_, n_ in ((5.0, 8), (10.0, 14), (15.0, 20)):
        for k in range(n_):
            t = 2 * np.pi * k / n_
            cuts.append(cyl_y(-30 + r_ * cos(t), 30 + r_ * sin(t), y1 - 1, CASE_Y1 + 1, 2.4, sections=12))
    # side vents
    for s in (-1, 1):
        for k in range(8):
            y = CASE_Y1 - 55 + 6 * k
            cuts.append(slab(min(s * (CASE_HW + 1), s * (CASE_HW - WALL - 1)), max(s * (CASE_HW + 1), s * (CASE_HW - WALL - 1)),
                             y, y + 2.0, 14, 44))
    # front panel, engraved: CD-ROM bay, floppy drive, power button, LEDs
    yf = CASE_Y0
    det = [
        rrect(58, 13, 1.0, -37, 47.5).difference(rrect(56.4, 11.4, 0.6, -37, 47.5)),   # 5.25" bay outline
        rrect(50, 0.8, 0.2, -37, 47.0), rrect(7, 2.4, 0.5, -14, 43.5),                  # tray line, eject
        rrect(40, 9, 1.0, 18, 47.0).difference(rrect(38.4, 7.4, 0.6, 18, 47.0)),        # 3.5" bay outline
        rrect(28, 1.6, 0.6, 15, 47.6), rrect(4, 2, 0.5, 33, 44.6),                      # floppy slot, button
        ring(57, 47.0, 10.0, 8.0), rrect(4.0, 1.6, 0.6, 47.5, 52.0), rrect(4.0, 1.6, 0.6, 47.5, 43.0),
    ]
    for p in det:
        cuts.append(engrave_front(p, yf, 0.8))
    case = D(case, *cuts)
    return single(case, "PixelCase")


def build_case_bottom():
    x0, x1, y0, y1 = case_inner_box()
    plate = ext_xy(box(x0 + 0.2, y0 + 0.2, x1 - 0.2, y1 - 0.2), 0, PLATE_T)
    adds = [cyl(*pi_xy(hx, hy), PLATE_T - OVER, PLATE_T + PI_STANDOFF, 6.0) for hx, hy in PI_HOLES]
    plate = U([plate, *adds])
    cuts = []
    for hx, hy in PI_HOLES:
        x, y = pi_xy(hx, hy)
        cuts.append(cyl(x, y, PLATE_T - 1.0, PLATE_T + PI_STANDOFF + 1, PILOT))
    for x, y in plate_screws():
        cuts += [cyl(x, y, -1, PLATE_T + 1, CLEAR), cyl(x, y, -1, CBORE_H, CBORE_D)]
    for k in range(6):                                               # vents under the Pi
        y = PI_Y0 - 50 + 7 * k
        cuts.append(slab(-20, 45, y, y + 3.0, -1, PLATE_T + 1))
    for x, y in plate_screws():                                      # rubber feet next to the screws
        cuts.append(cyl(x + (-8 if x > 0 else 8), y, -1, 1.0, 10.5))
    return single(D(plate, *cuts), "PixelCaseBottom")


# ------------------------------------------------------------------ stand
def build_stand():
    z0, z1 = CASE_H, CASE_H + STAND_H
    c = STAND_CHAMFER
    body = hull(cyl(0, STAND_Y, z0, z1 - c, 2 * STAND_R, sections=96),
                cyl(0, STAND_Y, z1 - c, z1, 2 * (STAND_R - c), sections=96))
    stand = D(body, cyl(0, STAND_Y, z0 - 1, z1 - WALL, 2 * (STAND_R - WALL), sections=96))
    groove = ext_xy(ring(0, STAND_Y, 2 * STAND_R + 2, 2 * STAND_R - 1.6), z0 + 3.0, z0 + 4.0)
    adds = [cyl(dx, STAND_Y + dy, z0, z1 - WALL + OVER, 7.0) for dx, dy in STAND_CASE_SCREWS]
    stand = U([stand, *adds])
    cuts = [groove]
    for dx, dy in STAND_CASE_SCREWS:
        cuts.append(cyl(dx, STAND_Y + dy, z0 - 1, z0 + 8, PILOT))
    for dx, dy in STAND_MON_SCREWS:
        cuts.append(cyl(dx, STAND_Y + dy, z1 - WALL - 1, z1 + 1, CLEAR))
    cuts.append(slab(-10, 10, STAND_Y - 2, STAND_Y + 9, z0 - 1, z1 + 1))
    return single(D(stand, *cuts), "PixelStand")


# ------------------------------------------------------------------ monitor
def screen_box():
    cz = MON_Z0 + SCR_BOTTOM + SCR_H / 2
    return 0.0, cz


def monitor_back_solid(inset=0.0, open_front=False):
    f, z0 = MON_F + BEZ_D, MON_Z0
    def sl(w, h, y0, y1):
        return ext_xz(rrect(w - 2 * inset, h - 2 * inset, max(1.0, BACK_R - inset), 0, z0 + h / 2), y0, y1)
    y_front = f - (1.0 if open_front else 0.0)
    return hull(sl(BACK_FRONT_W, BACK_FRONT_H, y_front, y_front + 0.01),
                sl(BACK_W, BACK_H, f + BACK_D - inset - 0.01, f + BACK_D - inset))


def build_monitor():
    f, z0 = MON_F, MON_Z0
    cx, cz = screen_box()
    # ---------- bezel (solid, printed face-down)
    front = hull(ext_xz(rrect(BEZ_W - 2 * BEZ_CHAMFER, BEZ_H - 2 * BEZ_CHAMFER, BEZ_R - BEZ_CHAMFER, 0, z0 + BEZ_H / 2), f, f + 0.01),
                 ext_xz(rrect(BEZ_W, BEZ_H, BEZ_R, 0, z0 + BEZ_H / 2), f + BEZ_CHAMFER, f + BEZ_D))
    sw, sh = SCR_W + 2 * SCR_CLR, SCR_H + 2 * SCR_CLR
    cuts = [ext_xz(rrect(sw, sh, 0.05, cx, cz), f + FUNNEL, f + BEZ_D + 1)]
    funnel = hull(ext_xz(rrect(WIN_W, WIN_H, WIN_R, cx, cz), f + FUNNEL, f + FUNNEL + 0.5),
                  ext_xz(rrect(WIN_W + 2 * FUNNEL, WIN_H + 2 * FUNNEL, WIN_R + FUNNEL * 0.5, cx, cz), f - 0.01, f + 0.01))
    cuts.append(funnel)
    # tongue slots for the back, pilots for the stand screws
    for s in (-1, 1):
        cuts.append(slab(s * 40 - 5.2, s * 40 + 5.2, f + BEZ_D - 6.5, f + BEZ_D + 0.5, 156.8, 158.8))
    for dx, dy in STAND_MON_SCREWS:
        if STAND_Y + dy < f + BEZ_D:
            cuts.append(cyl(dx, STAND_Y + dy, z0 - 1, z0 + 12, PILOT))
    # engraved controls under the screen: badge, knobs, LED, power button
    zc = z0 + 8.0
    det = [text_poly("PIXEL", 6.5, -57.0, zc - 3.0), ring(16, zc, 4.6, 3.0), ring(24, zc, 4.6, 3.0), ring(32, zc, 4.6, 3.0),
           rrect(5.0, 1.8, 0.6, 42.5, zc), ring(53.5, zc, 9.0, 7.0), Point(53.5, zc).buffer(1.0, quad_segs=12)]
    for p in det:
        cuts.append(engrave_front(p, f, 0.7))
    bezel = single(D(front, *cuts), "PixelMonitorFront")

    # ---------- tapered CRT back (shell, printed back-down)
    back = D(monitor_back_solid(), monitor_back_solid(WALL, open_front=True))
    adds = []
    # posts pressing the screen forward (with 1 mm foam pads)
    y_press = f + FUNNEL + SCR_T + 1.0
    for px in (-35.0, 35.0):
        for pz in (cz - 16.0, cz + 8.0):
            adds.append(cyl_y(px, pz, y_press, f + BEZ_D + BACK_D - WALL + OVER, 8.0))
    # bottom block for the stand screws
    # (ends in a 45 deg ramp so it prints without support)
    adds.append(hull(slab(-26, 26, f + BEZ_D, f + BEZ_D + 20, z0 + 0.5, z0 + 10),
                     slab(-26, 26, f + BEZ_D + 20, f + BEZ_D + 29.5, z0 + 0.5, z0 + 1.0)))
    # tongues reaching into the bezel
    for s in (-1, 1):
        adds.append(slab(s * 40 - 4.8, s * 40 + 4.8, f + BEZ_D - 6.0, f + BEZ_D + 2.0, 157.0, 158.6))
    back = I(U([back, *adds]), U([monitor_back_solid(), slab(-200, 200, f + BEZ_D - 7, f + BEZ_D + 0.01, -10, 400)]))
    bcuts = []
    for dx, dy in STAND_MON_SCREWS:
        if STAND_Y + dy > f + BEZ_D:
            bcuts.append(cyl(dx, STAND_Y + dy, z0 - 1, z0 + 9, PILOT))
    bcuts.append(slab(-10, 10, f + BEZ_D - 0.5, f + BEZ_D + 8, z0 - 1, z0 + 11))        # screen ribbon, open to the split face
    # perforated grilles on both sides and on top (only through the walls, clear of the screen posts)
    cols_y = [f + BEZ_D + 40 + 9 * j for j in range(6)]
    for s in (-1, 1):
        for i in range(7):
            z = z0 + 22 + 8 * i
            for y in cols_y:
                bcuts.append(slab(min(s * 44, s * 70), max(s * 44, s * 70), y, y + 6.0, z, z + 2.2))
    for i in range(13):
        x = -36 + 6 * i
        for y in cols_y:
            bcuts.append(slab(x - 1.1, x + 1.1, y, y + 6.0, z0 + 70, z0 + 110))
    back = single(D(back, *bcuts), "PixelMonitorBack")
    return bezel, back


def build_fit_test():
    sw, sh = SCR_W + 2 * SCR_CLR, SCR_H + 2 * SCR_CLR
    frame = rrect(sw + 6, sh + 6, 3.0).difference(rrect(sw, sh, 0.05))
    lipf = rrect(sw + 6, sh + 6, 3.0).difference(rrect(WIN_W, WIN_H, WIN_R))
    return single(U([ext_xy(lipf, 0, 2.0), ext_xy(frame, 2.0 - OVER, 6.0)]), "ScreenFitTest")


# ------------------------------------------------------------------ print poses
def pose(m, kind):
    m = m.copy()
    rot = {"upright": None, "top_down": (np.pi, [1, 0, 0]), "face_down": (np.pi / 2, [1, 0, 0]),
           "back_down": (-np.pi / 2, [1, 0, 0])}[kind]
    if rot:
        m.apply_transform(trimesh.transformations.rotation_matrix(*rot))
    m.apply_translation([-m.centroid[0], -m.centroid[1], -m.bounds[0][2]])
    return m


def build_all():
    tray, case, plate, stand = build_tray(), build_case(), build_case_bottom(), build_stand()
    bezel, back = build_monitor()
    assembled = dict(PixelKeyboardTray=tray, PixelCase=case, PixelCaseBottom=plate, PixelStand=stand,
                     PixelMonitorFront=bezel, PixelMonitorBack=back)
    printable = {
        "PixelMonitorFront": pose(bezel, "face_down"), "PixelMonitorBack": pose(back, "back_down"),
        "PixelStand": pose(stand, "top_down"), "PixelCase": pose(case, "top_down"),
        "PixelCaseBottom": pose(plate, "upright"), "PixelKeyboardTray": pose(tray, "upright"),
        "ScreenFitTest": build_fit_test(),
    }
    return assembled, printable


def main():
    OUT.mkdir(exist_ok=True)
    for old in OUT.glob("*.stl"):
        old.unlink()
    _, printable = build_all()
    for name, m in printable.items():
        m.export(OUT / f"{name}.stl")
        w, d, h = m.extents
        print(f"{name:18s} {w:6.1f} x {d:6.1f} x {h:5.1f} mm   ~{m.volume / 1000 * 1.24:5.0f} g if solid")


if __name__ == "__main__":
    main()
