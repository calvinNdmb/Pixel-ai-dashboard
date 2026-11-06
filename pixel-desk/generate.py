"""Pixel: a desk companion with a 4.3" touch screen face and a Stream Deck MK.2.

No moving parts. A Raspberry Pi 4 lives in the base, the screen in the head,
and a reclined Stream Deck MK.2 sits in the front of the base.

Parts (stl/), each exported in its print orientation, no supports needed:
    PixelBase.stl        base (prints upright)
    PixelLid.stl         lid over the Pi compartment (prints top-down)
    PixelNeck.stl        neck (prints upright, 45 deg flare at the top)
    PixelHeadFront.stl   front of the head, holds the screen (prints face-down)
    PixelHeadBack.stl    back of the head (prints back-down)
    PixelEarLeft.stl / PixelEarRight.stl / PixelEarInner.stl
    ScreenFitTest.stl    thin frame to check the screen size before the big prints

    pip install trimesh manifold3d shapely mapbox_earcut numpy scipy
    python generate.py

Coordinates: X = left/right, Y = front (0) to back, Z = up. Units: mm.
"""

from math import cos, radians, sin, tan
from pathlib import Path

import numpy as np
import trimesh
from shapely import affinity
from shapely.geometry import Point, Polygon, box

OUT = Path(__file__).parent / "stl"

# ------------------------------------------------------------------ components
SD_W, SD_H, SD_T = 118.0, 84.0, 25.0            # Stream Deck MK.2, stand removed
SD_ANGLE = 40.0                                 # deck tilt from horizontal
SD_CLR, SD_SIDE_CLR = 0.8, 0.75

# Waveshare 4.3inch DSI LCD (SKU 16239), outline from retailer data: measure yours
# and print ScreenFitTest.stl first.
SCR_W, SCR_H, SCR_T = 106.0, 68.0, 14.05
SCR_CLR = 0.3
WIN_W, WIN_H, WIN_R = 101.0, 63.0, 3.0          # visible window in the front
ACTIVE_W, ACTIVE_H = 95.04, 53.86               # for previews only

PI_L, PI_W = 85.0, 56.0                         # Raspberry Pi 4 board
PI_HOLES = [(3.5, 3.5), (61.5, 3.5), (3.5, 52.5), (61.5, 52.5)]
PI_STANDOFF = 5.0

SPK_D, SPK_H = 40.0, 18.0                       # 40 mm speaker under the lid

# ------------------------------------------------------------------ base
FLOOR = 2.5
EDGE_R = 4.0                                    # rounding of the base's top edges
BASE_FRONT_HW, BASE_BACK_HW, BASE_D = 65.5, 75.0, 170.0
BASE_CORNER_R = 18.0
Z_TOP = 60.0                                    # top of the base behind the deck
LIP_T = 5.0                                     # front lip in front of the deck
DECK_Z0 = 24.0                                  # height of the deck's front-bottom edge
LID_T = 3.0
LID_Y0 = 90.0                                   # front edge of the lid opening
WALL = 2.4

# Pi placement (board rotated 180 deg: USB-C edge at the back, USB-A ports face -X)
PI_X0 = 60.0                                    # X of the board's SD-card edge
PI_Y0 = 161.5                                   # Y of the board's USB-C edge

NECK_Y = 118.0
NECK_OX, NECK_OY = 32.0, 20.0                   # oval outer size
NECK_WALL = 2.2
FLANGE_X, FLANGE_Y, FLANGE_T = 52.0, 28.0, 3.0
FLARE = 8.0                                     # 45 deg flare from the flange up to the tube
NECK_SCREW_X = 22.0                             # flange screws into the lid
SOCKET_D = 8.0                                  # neck end that sits in the head
JOIN_X, JOIN_DZ = 14.5, 4.4                     # 2 M2.5x20 screws from the back of the head, through the neck wall
JOIN_CBORE = 2.5

# ------------------------------------------------------------------ head
HEAD_W, HEAD_H, HEAD_D = 124.0, 86.0, 28.0
HEAD_R = 16.0
HEAD_BACK_W, HEAD_BACK_H, HEAD_BACK_R = 112.0, 76.0, 15.0
HEAD_SLAB = 10.0                                # straight part before the taper
HEAD_CHAMFER = 1.5
HEAD_WALL = 2.4
FRONT_WALL = 2.0
HEAD_Z0 = 82.0                                  # bottom of the head
SPLIT = FRONT_WALL + SCR_T + 0.55               # depth where front and back meet

PILOT = 2.2                                     # M2.5 self-tapping pilot
CLEAR = 2.8
CBORE_D, CBORE_H = 5.0, 1.8

OVER = 0.01


# ------------------------------------------------------------------ helpers
def rrect(w, h, r, cx=0.0, cy=0.0):
    r = min(r, w / 2 - 0.01, h / 2 - 0.01)
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


def slab(x0, x1, y0, y1, z0, z1):
    b = trimesh.creation.box(extents=[x1 - x0, y1 - y0, z1 - z0])
    b.apply_translation([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2])
    return b


def cyl(x, y, z0, z1, d, axis="z", sections=48):
    c = trimesh.creation.cylinder(radius=d / 2, height=z1 - z0, sections=sections)
    if axis == "y":
        c.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [1, 0, 0]))
        c.apply_translation([x, (z0 + z1) / 2, y])   # here y is the Z centre
        return c
    c.apply_translation([x, y, (z0 + z1) / 2])
    return c


def U(ms):
    ms = [m for m in ms if m is not None]
    return trimesh.boolean.union(ms, engine="manifold") if len(ms) > 1 else ms[0]


def D(a, *bs):
    for b in bs:
        a = a.difference(b, engine="manifold")
    return a


def I(a, b):
    return a.intersection(b, engine="manifold")


def hull(*meshes):
    return trimesh.convex.convex_hull(np.vstack([m.vertices for m in meshes]))


def hemisphere_points(r, n=10):
    pts = []
    for i in range(n + 1):
        el = (np.pi / 2) * i / n
        ring = max(8, int(48 * cos(el)))
        for k in range(ring):
            az = 2 * np.pi * k / ring
            pts.append((r * cos(el) * cos(az), r * cos(el) * sin(az), r * sin(el)))
    return np.array(pts)


def round_top(core, r):
    """Minkowski sum with an upper hemisphere: rounded top and vertical edges, flat bottom."""
    P = core.vertices[:, None, :] + hemisphere_points(r)[None, :, :]
    return trimesh.convex.convex_hull(P.reshape(-1, 3))


def single(mesh, name):
    with np.errstate(all="ignore"):
        pieces = [p for p in mesh.split(only_watertight=False) if abs(p.volume) > 1.0]
    assert len(pieces) == 1, f"{name}: {len(pieces)} pieces"
    m = pieces[0]
    assert m.is_watertight and m.volume > 0, name
    return m


def heart(cx, cy, w):
    t = np.linspace(0, 2 * np.pi, 120, endpoint=False)
    x = 16 * np.sin(t) ** 3
    y = 13 * np.cos(t) - 5 * np.cos(2 * t) - 2 * np.cos(3 * t) - np.cos(4 * t)
    s = w / 32.0
    return Polygon(np.c_[cx + x * s, cy + (y + 2) * s]).buffer(0)


# ------------------------------------------------------------------ layout
def deck_pose():
    a = radians(SD_ANGLE)
    u = np.array([cos(a), sin(a)])                 # up the slope (Y, Z)
    n = np.array([-sin(a), cos(a)])                # out of the keys
    t = SD_T + SD_CLR
    f0 = np.array([LIP_T, DECK_Z0])                # front-bottom edge
    b0 = f0 - t * n                                # back-bottom edge
    return dict(u=u, n=n, t=t, f0=f0, b0=b0, b1=b0 + (SD_H + 0.5) * u, f1=f0 + (SD_H + 0.5) * u)


def base_outline(inset=0.0):
    p = Polygon([(-BASE_FRONT_HW, 0), (BASE_FRONT_HW, 0), (BASE_BACK_HW, BASE_D), (-BASE_BACK_HW, BASE_D)])
    return p.buffer(-BASE_CORNER_R).buffer(BASE_CORNER_R - inset, quad_segs=16) if inset < BASE_CORNER_R else p.buffer(-inset)


def base_profile():
    slope = tan(radians(SD_ANGLE))
    lip_top = DECK_Z0 + 6.0
    y_knee = (Z_TOP - lip_top) / slope
    return Polygon([(0, 0), (0, lip_top), (y_knee, Z_TOP), (BASE_D, Z_TOP), (BASE_D, 0)])


def pi_xy(hx, hy):
    """Board coordinates (x along the 85 mm edge from the SD-card side, y from the USB-C edge) -> base X, Y."""
    return PI_X0 - hx, PI_Y0 - hy


def neck_screws():
    return [(-NECK_SCREW_X, NECK_Y), (NECK_SCREW_X, NECK_Y)]


def head_front_y():
    return NECK_Y - 15.0


# ------------------------------------------------------------------ base
def build_base():
    dp = deck_pose()
    r = EDGE_R
    core_top = ext_xy(base_outline(r), 0, Z_TOP + 10)
    prof = base_profile().buffer(-r)
    pts = np.array(prof.exterior.coords)
    prof_core = Polygon(np.vstack([pts, np.c_[pts[:, 0], np.zeros(len(pts))]])).convex_hull
    core = I(core_top, ext_yz(prof_core, -200, 200))
    outer = round_top(core, r)

    sd_hw = SD_W / 2 + SD_SIDE_CLR
    f0, b0, b1, u = dp["f0"], dp["b0"], dp["b1"], dp["u"]
    pocket = ext_yz(Polygon([tuple(f0), tuple(b0), tuple(b0 + 300 * u), (f0[0], 300)]), -sd_hw, sd_hw)
    under = ext_yz(Polygon([(b0[0], FLOOR), tuple(b0), tuple(b1), (b1[0] + 0.01, Z_TOP + 20), (LID_Y0 + 1, Z_TOP + 20),
                            (LID_Y0 + 1, FLOOR)]), -sd_hw, sd_hw)
    rear_in = base_outline(WALL + r).intersection(box(-200, LID_Y0, 200, 400))
    rear = ext_xy(rear_in, FLOOR, Z_TOP + 20)
    base = D(outer, U([pocket, under, rear]))

    adds = []
    # ribs the Stream Deck rests on (centre left free for its cable)
    for x in (-47.0, -22.0, 22.0, 47.0):
        rib = Polygon([(b0[0], FLOOR - OVER), tuple(b0), tuple(b1 - 1.5 * u), (b1[0] - 1.5 * u[0], FLOOR - OVER)])
        adds.append(ext_yz(rib, x - 1.2, x + 1.2))
    # lid supports
    lid_posts = [(-60.0, 97.0), (60.0, 97.0), (-66.0, 150.0), (66.0, 150.0)]
    for x, y in lid_posts:
        adds.append(cyl(x, y, FLOOR - OVER, Z_TOP - LID_T, 8.0))
    # Pi standoffs
    for hx, hy in PI_HOLES:
        x, y = pi_xy(hx, hy)
        adds.append(cyl(x, y, FLOOR - OVER, FLOOR + PI_STANDOFF, 6.0))
    base = U([base, *adds])

    cuts = []
    for x, y in lid_posts:
        cuts.append(cyl(x, y, Z_TOP - LID_T - 9, Z_TOP, PILOT))
    for hx, hy in PI_HOLES:
        x, y = pi_xy(hx, hy)
        cuts.append(cyl(x, y, FLOOR + 0.6, FLOOR + PI_STANDOFF + 1, PILOT))
    # USB-C power port through the back wall
    ux, uy = pi_xy(11.2, 0)
    uz = FLOOR + PI_STANDOFF + 1.5 + 1.6
    cuts.append(slab(ux - 6.8, ux + 6.8, uy - 1, BASE_D + 5, uz - 4.2, uz + 4.2))
    # floor vents under the Pi, side vents, mic holes
    for k in range(6):
        y = 116 + 7 * k
        cuts.append(slab(-12, 50, y, y + 3.0, -1, FLOOR + 1))
    for s in (-1, 1):
        for k in range(6):
            y = 108 + 8 * k
            cuts.append(slab(s * 60 - 30, s * 60 + 30, y, y + 3.0, 34, 52) if False else None)
    for s in (-1, 1):
        x_wall = s * (BASE_BACK_HW + 2)
        for k in range(6):
            y = 108 + 8 * k
            cuts.append(slab(min(s * 55, x_wall), max(s * 55, x_wall), y, y + 3.0, 34, 52))
    for k in range(3):
        cuts.append(cyl(-74, 128 + 4 * k, 0, 0, 0) if False else slab(-80, -60, 127 + 4 * k, 128.6 + 4 * k, 14, 22))
    # rubber feet pockets
    for x, y in ((-48, 18), (48, 18), (-58, 152), (58, 152)):
        cuts.append(cyl(x, y, -1, 1.0, 10.5))
    base = D(base, *[c for c in cuts if c is not None])
    return single(base, "PixelBase")


def build_lid():
    outline = base_outline(WALL + EDGE_R + 0.25).intersection(box(-200, LID_Y0 + 0.25, 200, 400))
    lid = ext_xy(outline, Z_TOP - LID_T, Z_TOP)
    adds = []
    for x, y in neck_screws():
        adds.append(cyl(x, y, Z_TOP - LID_T - 8, Z_TOP - LID_T + OVER, 7.0))
    sx, sy = 38.0, 140.0
    ring = Point(sx, sy).buffer(SPK_D / 2 + 2.2, quad_segs=24).difference(Point(sx, sy).buffer(SPK_D / 2 + 0.3, quad_segs=24))
    adds.append(ext_xy(ring, Z_TOP - LID_T - 4, Z_TOP - LID_T + OVER))
    # stiffening ribs
    adds.append(slab(-60, 14, 133.8, 135.6, Z_TOP - LID_T - 5, Z_TOP - LID_T + OVER))
    lid = U([lid, *adds])
    cuts = []
    for x, y in [(-60.0, 97.0), (60.0, 97.0), (-66.0, 150.0), (66.0, 150.0)]:
        cuts += [cyl(x, y, Z_TOP - 10, Z_TOP + 1, CLEAR), cyl(x, y, Z_TOP - CBORE_H, Z_TOP + 1, CBORE_D)]
    for x, y in neck_screws():
        cuts.append(cyl(x, y, Z_TOP - LID_T - 9, Z_TOP + 1, PILOT))
    cuts.append(ext_xy(rrect(24.0, 12.0, 5.5, 0, NECK_Y), Z_TOP - 10, Z_TOP + 1))          # screen ribbon
    hp = heart(sx, sy, 36.0)
    for gx in np.arange(sx - 18, sx + 18.1, 4.2):
        for gy in np.arange(sy - 18, sy + 18.1, 4.2):
            if hp.buffer(-1.6).contains(Point(gx, gy)):
                cuts.append(cyl(gx, gy, Z_TOP - 10, Z_TOP + 1, 2.6, sections=20))
    lid = D(lid, *cuts)
    return single(lid, "PixelLid")


# ------------------------------------------------------------------ neck
def oval(w, h, cy=NECK_Y):
    return affinity.translate(affinity.scale(Point(0, 0).buffer(1, quad_segs=32), w / 2, h / 2), 0, cy)


def build_neck():
    """Oval tube: flange screwed to the lid, top end clamped in the head's socket."""
    z0, z1 = Z_TOP, HEAD_Z0
    tube = ext_xy(oval(NECK_OX, NECK_OY), z0 + FLANGE_T + FLARE - OVER, z1 + SOCKET_D)
    bottom = ext_xy(oval(FLANGE_X, FLANGE_Y), z0, z0 + FLANGE_T)
    flare = hull(ext_xy(oval(NECK_OX + 6.0, NECK_OY + 3.0), z0 + FLANGE_T - OVER, z0 + FLANGE_T),
                 ext_xy(oval(NECK_OX, NECK_OY), z0 + FLANGE_T + FLARE, z0 + FLANGE_T + FLARE + OVER))
    neck = U([tube, bottom, flare])
    neck = D(neck, ext_xy(oval(NECK_OX - 2 * NECK_WALL, NECK_OY - 2 * NECK_WALL), z0 - 1, z1 + SOCKET_D + 1))
    cuts = [cyl(x, y, z0 - 1, z0 + FLANGE_T + 0.01, CLEAR) for x, y in neck_screws()]
    for s in (-1, 1):   # the head's joining screws pass through the neck end
        cuts.append(cyl(s * JOIN_X, HEAD_Z0 + JOIN_DZ, NECK_Y - 20, NECK_Y + 20, CLEAR, axis="y"))
    neck = D(neck, *cuts)
    return single(neck, "PixelNeck")


# ------------------------------------------------------------------ head
def head_solid(inset=0.0, front=None):
    """Head volume shrunk by `inset` (front face shrunk by `front`, default the same). Flat bottom."""
    f = head_front_y()
    fr = inset if front is None else front

    def slab_rr(w, h, r, y0, y1):
        # h is the outer height from the head's bottom; inset keeps the bottom flat
        return ext_xz(rrect(w - 2 * inset, h - 2 * inset, max(1.0, r - inset), 0, HEAD_Z0 + h / 2), y0, y1)

    front0 = slab_rr(HEAD_W - 2 * HEAD_CHAMFER, HEAD_H - HEAD_CHAMFER, HEAD_R - HEAD_CHAMFER, f + fr, f + fr + 0.01)
    front1 = slab_rr(HEAD_W, HEAD_H, HEAD_R, f + fr + HEAD_CHAMFER, f + HEAD_SLAB)
    back = slab_rr(HEAD_BACK_W, HEAD_BACK_H, HEAD_BACK_R, f + HEAD_D - inset - 0.01, f + HEAD_D - inset)
    return hull(front0, front1, back)


def screen_center():
    return 0.0, HEAD_Z0 + HEAD_H / 2


def build_head():
    f = head_front_y()
    cx, cz = screen_center()
    shell = D(head_solid(), head_solid(HEAD_WALL, front=FRONT_WALL))
    sw, sh = SCR_W + 2 * SCR_CLR, SCR_H + 2 * SCR_CLR
    adds = []
    # locator frame around the screen
    frame = rrect(sw + 2.4, sh + 2.4, 1.0, cx, cz).difference(rrect(sw, sh, 0.05, cx, cz))
    adds.append(ext_xz(frame, f + FRONT_WALL - OVER, f + FRONT_WALL + 10))
    # bottom block holding the neck: the socket is split between front and back
    zb_top = cz - sh / 2 - 0.4
    adds.append(slab(-21, 21, f + FRONT_WALL - OVER, f + HEAD_D - HEAD_WALL + OVER, HEAD_Z0 + 0.5, zb_top))
    # top blocks for the back's tongues, and ear sockets
    zt0 = cz + sh / 2 + 0.4
    for s in (-1, 1):
        adds.append(slab(s * 40 - 5.5, s * 40 + 5.5, f + FRONT_WALL - OVER, f + SPLIT, zt0, HEAD_Z0 + HEAD_H - 0.5))
    # press posts on the back, pushing the screen forward (with a 1 mm foam pad)
    for px in (-35, 35):
        for pz in (cz - 18, cz + 18):
            adds.append(cyl(px, pz, f + FRONT_WALL + SCR_T + 1.0, f + HEAD_D - HEAD_WALL + OVER, 6.0, axis="y"))
    head = I(U([shell, *adds]), head_solid())

    cuts = [ext_xz(rrect(WIN_W, WIN_H, WIN_R, cx, cz), f - 1, f + FRONT_WALL + 0.5)]
    # neck socket (the screen ribbon goes up through the neck)
    cuts.append(ext_xy(oval(NECK_OX + 0.4, NECK_OY + 0.4), HEAD_Z0 - 1, HEAD_Z0 + SOCKET_D + 0.2))
    cuts.append(ext_xy(oval(NECK_OX - 2 * NECK_WALL, NECK_OY - 2 * NECK_WALL), HEAD_Z0, zb_top + 1))
    # tongue slots (open towards the split face) and ear sockets
    for s in (-1, 1):
        cuts.append(slab(s * 40 - 5.2, s * 40 + 5.2, f + SPLIT - 7.0, f + SPLIT + 0.5, zt0 + 1.2, zt0 + 3.2))
        cuts.append(slab(s * 40 - 4.0, s * 40 + 4.0, f + 4.7, f + 7.3, HEAD_Z0 + HEAD_H - 5.0, HEAD_Z0 + HEAD_H + 1))
    head = D(head, *cuts)

    front = I(head, slab(-200, 200, f - 5, f + SPLIT, -10, 400))
    back = I(head, slab(-200, 200, f + SPLIT, f + 100, -10, 400))
    # back: alignment lip and tongues reaching into the front
    # alignment lip on the left and right sides, reaching 4 mm into the front part;
    # anchored in the back's wall with two 0.75 mm steps so it prints without support
    ring = lambda a, b, y0, y1: I(D(head_solid(a), head_solid(b)), slab(-200, 200, y0, y1, -10, 400))
    lip = U([ring(HEAD_WALL + 0.25, HEAD_WALL + 1.45, f + SPLIT - 4.0, f + SPLIT + OVER),
             ring(HEAD_WALL - 1.2, HEAD_WALL + 1.45, f + SPLIT, f + SPLIT + 0.75),
             ring(HEAD_WALL - 1.2, HEAD_WALL + 0.7, f + SPLIT + 0.75 - OVER, f + SPLIT + 1.5)])
    lip = D(lip, slab(-54.9, 54.9, f - 10, f + 100, -10, 400))
    tongues = [slab(s * 40 - 4.8, s * 40 + 4.8, f + SPLIT - 6.5, f + SPLIT + 2.0, zt0 + 1.4, zt0 + 3.0) for s in (-1, 1)]
    back = U([back, lip, *tongues])
    # joining screws: from the back face, through the neck end, into the front part
    jz = HEAD_Z0 + JOIN_DZ
    jcuts = []
    for s in (-1, 1):
        jcuts += [cyl(s * JOIN_X, jz, f + SPLIT - 1, f + HEAD_D + 1, CLEAR, axis="y"),
                  cyl(s * JOIN_X, jz, f + HEAD_D - JOIN_CBORE, f + HEAD_D + 1, CBORE_D, axis="y")]
    back = D(back, *jcuts)
    front = D(front, *[cyl(s * JOIN_X, jz, f + 5.0, f + SPLIT + 1, PILOT, axis="y") for s in (-1, 1)])
    return single(front, "PixelHeadFront"), single(back, "PixelHeadBack")


def build_ears():
    ears = []
    for lean in (-1, 1):
        tri = Polygon([(-11, 2), (11, 2), (lean * 3.0, 19)]).buffer(3.0, quad_segs=16)
        ear = ext_xy(tri, 0, 4.0)
        pocket = Polygon([(-6.5, 5.5), (6.5, 5.5), (lean * 2.0, 15.0)]).buffer(1.2, quad_segs=12)
        ear = D(ear, ext_xy(pocket, 3.1, 5))
        tab = ext_xy(box(-3.85, -5.0, 3.85, 0.6), 0.8, 3.2)
        ears.append(single(U([ear, tab]), "PixelEar"))
    pocket = Polygon([(-6.5, 5.5), (6.5, 5.5), (0, 15.0)]).buffer(1.05, quad_segs=12)
    insert = single(ext_xy(pocket, 0, 0.8), "PixelEarInner")
    return ears, insert


def build_fit_test():
    sw, sh = SCR_W + 2 * SCR_CLR, SCR_H + 2 * SCR_CLR
    frame = rrect(sw + 6, sh + 6, 3.0).difference(rrect(sw, sh, 0.05))
    lipf = rrect(sw + 6, sh + 6, 3.0).difference(rrect(WIN_W, WIN_H, WIN_R))
    return single(U([ext_xy(lipf, 0, FRONT_WALL), ext_xy(frame, FRONT_WALL - OVER, FRONT_WALL + 4.0)]), "ScreenFitTest")


# ------------------------------------------------------------------ print poses
def pose_upright(m):
    m = m.copy(); m.apply_translation([0, 0, -m.bounds[0][2]]); return m


def pose_top_down(m):
    m = m.copy(); m.apply_transform(trimesh.transformations.rotation_matrix(np.pi, [1, 0, 0]))
    m.apply_translation([0, 0, -m.bounds[0][2]]); return m


def pose_face_down(m):
    m = m.copy(); m.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [1, 0, 0]))
    m.apply_translation([0, 0, -m.bounds[0][2]]); return m


def pose_back_down(m):
    m = m.copy(); m.apply_transform(trimesh.transformations.rotation_matrix(-np.pi / 2, [1, 0, 0]))
    m.apply_translation([0, 0, -m.bounds[0][2]]); return m


def build_all():
    base, lid, neck = build_base(), build_lid(), build_neck()
    front, back = build_head()
    (ear_l, ear_r), ear_in = build_ears()
    fit = build_fit_test()
    assembled = dict(PixelBase=base, PixelLid=lid, PixelNeck=neck, PixelHeadFront=front, PixelHeadBack=back)
    printable = {
        "PixelBase": pose_upright(base), "PixelLid": pose_top_down(lid), "PixelNeck": pose_upright(neck),
        "PixelHeadFront": pose_face_down(front), "PixelHeadBack": pose_back_down(back),
        "PixelEarLeft": ear_l, "PixelEarRight": ear_r, "PixelEarInner": ear_in, "ScreenFitTest": fit,
    }
    return assembled, printable


def main():
    OUT.mkdir(exist_ok=True)
    _, printable = build_all()
    for name, m in printable.items():
        m.export(OUT / f"{name}.stl")
        w, d, h = m.extents
        print(f"{name:15s} {w:6.1f} x {d:6.1f} x {h:5.1f} mm   ~{m.volume / 1000 * 1.24:5.0f} g if solid")


if __name__ == "__main__":
    main()
