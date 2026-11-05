"""Stream Deck dock for the Tiny Engineer desk robot (SG90 build).

The robot sits in a pocket on top. Under it, at the front, a reclined slot
holds a Stream Deck with its keys facing you. The cable runs from the back
of the Stream Deck through a channel and out of the back of the dock.

The dock is open underneath and on top (the robot covers the top), so it
prints with no supports: every wall is vertical, the backrest leans 25 deg
and the ledges that carry the robot are 45 deg steps.

    pip install trimesh manifold3d shapely mapbox_earcut numpy
    python generate.py                # writes stl/StreamDeckDock_<preset>.stl

Coordinates: X = left/right, Y = front (0) to back, Z = up. Units: mm.
"""

from math import cos, radians, sin, tan
from pathlib import Path

import numpy as np
import trimesh
from shapely import affinity
from shapely.geometry import Polygon, box

OUT = Path(__file__).parent / "stl"

# Stream Deck bodies (width, height, thickness), stand removed / folded.
DECKS = {
    "MK2": (118.0, 84.0, 25.0),   # Stream Deck MK.2, 15 keys, stand removed
    "Neo": (107.0, 78.0, 26.0),   # Stream Deck Neo, stand folded
}

# Tiny Engineer SG90 robot footprint (underside of Desk + Chair), measured
# from 3d_models/parts/sg90/stl/BottomCover.stl. Robot coordinates:
# +x = towards the robot's front (desk side), y = left/right. Right half only.
FOOTPRINT_HALF = [
    (59.9, 69.7), (57.0, 72.7), (-11.6, 72.7), (-13.9, 70.0), (-13.9, 49.0),
    (-11.6, 46.7), (-4.4, 46.7), (-4.4, 43.7), (-59.9, 43.7),
]

RECLINE = 25.0      # Stream Deck lean back from vertical, degrees
DECK_CLR = 1.0      # extra slot thickness
SIDE_CLR = 0.75     # slot clearance per side
ROBOT_CLR = 0.6     # robot pocket clearance per side

WALL = 2.4          # outer walls (and the robot lip)
LIP = 3.0           # how far the lip rises above the robot platform
LEDGE = 3.0         # width of the ledge the robot rests on
PLATE = 2.4         # backrest thickness
CHEEK = 3.0         # slot side walls
FRONT_LIP_T = 4.0   # lip in front of the Stream Deck
FRONT_LIP_H = 5.0   # how far that lip rises above the slot floor
FLOOR = 3.0         # slot floor height at its lowest point
CHEEK_OVER = 2.5    # how far the side walls reach in front of the keys
CHANNEL_W = 32.0    # cable channel width (centre of the dock)

OVERLAP = 0.6


def footprint():
    half = FOOTPRINT_HALF
    other = [(x, -y) for x, y in reversed(half)]
    return Polygon(half + other)


def extrude_xy(poly, z0, z1):
    m = trimesh.creation.extrude_polygon(poly, z1 - z0)
    m.apply_translation([0, 0, z0])
    return m


def extrude_yz(poly, x0, x1):
    """Extrude a side profile drawn in (y, z) across X from x0 to x1."""
    m = trimesh.creation.extrude_polygon(poly, x1 - x0)
    # (a, b, c) -> (X, Y, Z) = (c + x0, a, b). Proper rotation, no mirroring.
    m.apply_transform(np.array([[0, 0, 1, x0], [1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 0, 1]], dtype=float))
    return m


def extrude_xz(poly, y0, y1):
    """Extrude a profile drawn in (x, z) along Y from y0 to y1."""
    m = trimesh.creation.extrude_polygon(poly, y1 - y0)
    # (a, b, c) -> (X, Y, Z) = (a, y1 - c, b): a rotation (det = +1).
    m.apply_transform(np.array([[1, 0, 0, 0], [0, 0, -1, y1], [0, 1, 0, 0], [0, 0, 0, 1]], dtype=float))
    return m


def union(meshes):
    return trimesh.boolean.union(meshes, engine="manifold")


def build(deck_w, deck_h, deck_t):
    th = radians(RECLINE)
    t = deck_t + DECK_CLR
    u = np.array([sin(th), cos(th)])     # up along the backrest
    n = np.array([-cos(th), sin(th)])    # out of the backrest, towards you

    # ---- side profile of the slot (y, z) ----
    p2 = np.array([FRONT_LIP_T, FLOOR + t * sin(th)])     # front end of slot floor
    b0 = p2 - t * n                                       # back end of floor, foot of backrest
    height = b0[1] + (deck_h + 0.5) * cos(th)              # robot platform = top of the deck's back
    b_top = b0 + (height - b0[1]) / cos(th) * u
    y_s = b_top[0]                                        # front face of the robot block
    q0 = b0 - PLATE * n                                   # back face of the backrest
    q_bot = q0 + (-q0[1] / cos(th)) * u
    z_q = q0[1] + (y_s + OVERLAP - q0[0]) / tan(th)
    assert z_q < height, "backrest too thick for this recline"

    lip_top = p2[1] + FRONT_LIP_H
    slot_profile = Polygon([
        (0, 0), (0, lip_top), (FRONT_LIP_T, lip_top), tuple(p2), tuple(b0), tuple(b_top),
        (y_s + OVERLAP, height), (y_s + OVERLAP, z_q), tuple(q_bot),
    ])
    assert slot_profile.is_valid

    front_w = deck_w + 2 * SIDE_CLR + 2 * CHEEK
    slot = extrude_yz(slot_profile, -front_w / 2, front_w / 2)

    # Side walls of the slot: they follow the keys' plane, CHEEK_OVER in front of it.
    c0 = p2 + CHEEK_OVER * n
    def on_cheek_line(z):
        s = (z - c0[1]) / cos(th)
        return tuple(c0 + s * u)
    top = height + LIP
    cheek_profile = Polygon([
        (0, 0), (0, lip_top), on_cheek_line(lip_top), on_cheek_line(top),
        (y_s + OVERLAP, top), (y_s + OVERLAP, 0),
    ])
    assert cheek_profile.is_valid
    cheeks = [extrude_yz(cheek_profile, front_w / 2 - CHEEK, front_w / 2),
              extrude_yz(cheek_profile, -front_w / 2, -front_w / 2 + CHEEK)]

    # ---- robot block (top view) ----
    fp = footprint().buffer(ROBOT_CLR, join_style="mitre")
    x_front = fp.bounds[2]
    # robot (x, y) -> dock (X, Y) = (y, offset - x): robot faces the front of the dock.
    pocket = affinity.affine_transform(fp, [0, 1, -1, 0, 0, x_front + y_s + WALL])
    outer = pocket.buffer(WALL, quad_segs=16)
    walls = extrude_xy(outer.difference(pocket), 0, top)
    # Ledge under the robot's edge: a 45 deg slope built from 0.25 mm steps.
    step = 0.25
    ledges = []
    for k in range(1, int(LEDGE / step) + 1):
        ring = pocket.difference(pocket.buffer(-k * step, join_style="mitre"))
        z0 = height - LEDGE + (k - 1) * step
        ledges.append(extrude_xy(ring, z0, min(z0 + step + OVERLAP, height)))

    y0, y1 = pocket.bounds[1], pocket.bounds[3]
    centre = box(-CHANNEL_W / 2, -1e3, CHANNEL_W / 2, 1e3)
    ribs = []
    for f in (0.30, 0.62, 0.85):
        yr = y0 + f * (y1 - y0)
        r = box(-1e3, yr - WALL / 2, 1e3, yr + WALL / 2).intersection(pocket).difference(centre)
        for g in getattr(r, "geoms", [r]):
            rib = extrude_xy(g, 0, height)
            xa, xb = g.bounds[0] + 7, g.bounds[2] - 7
            if xb - xa > 12:
                # Pointed arch window: saves filament, 45 deg top needs no support.
                w = xb - xa
                zt = height - 8 - w / 2
                window = Polygon([(xa, -1), (xb, -1), (xb, zt), ((xa + xb) / 2, zt + w / 2), (xa, zt)])
                rib = rib.difference(extrude_xz(window, yr - WALL, yr + WALL), engine="manifold")
            ribs.append(rib)

    dock = union([slot, *cheeks, walls, *ledges, *ribs])

    # ---- cuts ----
    cuts = []
    # cable slot through the backrest, open at the top
    s1, s2 = 14.0, (height - b0[1]) / cos(th) + 30.0
    a, b = b0 + s1 * u, b0 + s2 * u
    para = Polygon([tuple(a + 3 * n), tuple(a - (PLATE + 3) * n), tuple(b - (PLATE + 3) * n), tuple(b + 3 * n)])
    cuts.append(extrude_yz(para, -CHANNEL_W / 2, CHANNEL_W / 2))
    # gap in the front wall of the robot block
    cuts.append(extrude_xy(box(-CHANNEL_W / 2, y_s - 1, CHANNEL_W / 2, y_s + WALL + LEDGE + 1), -1, top + 1))
    # cable exit at the back: pointed arch, prints without support
    arch = Polygon([(-CHANNEL_W / 2 - 1, -1), (CHANNEL_W / 2 + 1, -1), (CHANNEL_W / 2 + 1, 12),
                    (0, 12 + CHANNEL_W / 2 + 1), (-CHANNEL_W / 2 - 1, 12)])
    y_back = outer.bounds[3]
    cuts.append(extrude_xz(arch, y_back - WALL - LEDGE - 2, y_back + 1))
    # notch in the back lip for the robot's own USB cable
    cuts.append(extrude_xy(box(-25, y_back - WALL - 1, 25, y_back + 1), height, top + 1))

    for c in cuts:
        dock = dock.difference(c, engine="manifold")

    # Booleans at the footprint's inside corners can leave zero-volume slivers.
    with np.errstate(all="ignore"):
        pieces = [p for p in dock.split(only_watertight=False) if abs(p.volume) > 1.0]
    assert len(pieces) == 1, f"dock came out in {len(pieces)} pieces"
    dock = pieces[0]

    info = dict(height=height, y_slot_back=y_s, deck_top_front=tuple(p2 + deck_h * u))
    return dock, info


def main():
    OUT.mkdir(exist_ok=True)
    for name, (w, h, t) in DECKS.items():
        dock, info = build(w, h, t)
        assert dock.is_watertight, name
        assert dock.volume > 0, name
        assert abs(dock.bounds[0][2]) < 1e-6, name
        dock.export(OUT / f"StreamDeckDock_{name}.stl")
        ex = dock.extents
        grams = dock.volume / 1000 * 1.24
        print(f"{name:4s} {ex[0]:.0f} x {ex[1]:.0f} x {ex[2]:.0f} mm  robot platform at {info['height']:.0f} mm  "
              f"~{grams:.0f} g PLA if printed solid")


if __name__ == "__main__":
    main()
