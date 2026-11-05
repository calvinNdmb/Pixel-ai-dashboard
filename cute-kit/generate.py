"""Generate the printable cute add-ons for a desk robot head.

Every part is printed in the orientation it is exported in (flat side on the
bed) and needs no supports. Sizes are in millimetres; change the constants
below and re-run to resize.

    pip install trimesh manifold3d shapely mapbox_earcut numpy
    python generate.py            # writes stl/*.stl
"""

from pathlib import Path

import numpy as np
import trimesh
from shapely import affinity
from shapely.geometry import Point, Polygon

OUT = Path(__file__).parent / "stl"

# Foot pad that every standing piece sits on (stick it with foam tape or glue).
PAD_W, PAD_D, PAD_T, PAD_R = 20.0, 10.0, 1.2, 2.0

# Cat ear: rounded triangle, tip leaning outward.
CAT_W, CAT_H, CAT_LEAN, CAT_R = 15.0, 14.0, 1.8, 2.2

# Bear ear: circle with the bottom cut flat.
BEAR_R, BEAR_CY = 7.0, 6.2

EAR_T = 4.5            # ear thickness (front to back)
RECESS = 0.9           # depth of the inner-ear pocket on the front face
INSERT_T = 0.8         # inner-ear insert thickness (printed flat, pink)
INSERT_GAP = 0.15      # clearance per side so the insert drops in

BLUSH_W, BLUSH_H, BLUSH_T = 10.0, 6.0, 0.8

HEART_W = 10.0         # heart width
HEART_T = 3.0
STEM_R, STEM_H = 1.6, 10.0
ANT_PAD = 11.0

OVERLAP = 0.4          # how far parts sink into each other so unions fuse


def rounded_rect(w, d, r):
    return Polygon([(-w / 2, -d / 2), (w / 2, -d / 2), (w / 2, d / 2), (-w / 2, d / 2)]).buffer(-r).buffer(r)


def plate(poly, t):
    """Extrude a 2D outline (XY) upward by t."""
    return trimesh.creation.extrude_polygon(poly, t)


def standing(poly, t, z0):
    """Extrude a 2D outline drawn in (x, height) so it stands up on the bed.

    The outline's y axis becomes Z, the extrusion runs along Y and is centred
    on y = 0. The front face is at y = -t/2.
    """
    m = trimesh.creation.extrude_polygon(poly, t)
    m.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [1, 0, 0]))
    m.apply_translation([0, t / 2, z0])
    return m


def pad(w=PAD_W, d=PAD_D):
    return plate(rounded_rect(w, d, PAD_R), PAD_T)


def cat_outline(lean):
    r = CAT_R
    tri = Polygon([(-CAT_W / 2 + r, r), (CAT_W / 2 - r, r), (lean, CAT_H - r)])
    return tri.buffer(r, quad_segs=24)


def cat_inner(lean):
    tri = Polygon([(-CAT_W / 2 + 3.6, 3.2), (CAT_W / 2 - 3.6, 3.2), (lean * 0.8, CAT_H - 4.6)])
    return tri.buffer(1.2, quad_segs=24)


def bear_outline():
    c = Point(0, BEAR_CY).buffer(BEAR_R, quad_segs=48)
    return c.intersection(Polygon([(-20, 0), (20, 0), (20, 30), (-20, 30)]))


def bear_inner():
    return Point(0, BEAR_CY + 0.6).buffer(BEAR_R * 0.55, quad_segs=48)


def ear(outline, inner):
    body = standing(outline, EAR_T, PAD_T - OVERLAP)
    pocket = standing(inner, RECESS + 0.5, PAD_T - OVERLAP)
    # Slide the pocket so it cuts RECESS deep into the front face (y = -EAR_T/2).
    pocket.apply_translation([0, -EAR_T / 2 + RECESS / 2 - 0.25, 0])
    return trimesh.boolean.union([pad(), body], engine="manifold").difference(pocket, engine="manifold")


def insert(inner):
    return plate(inner.buffer(-INSERT_GAP, quad_segs=24), INSERT_T)


def blush():
    oval = affinity.scale(Point(0, 0).buffer(1, quad_segs=48), BLUSH_W / 2, BLUSH_H / 2)
    return plate(oval, BLUSH_T)


def heart_outline():
    t = np.linspace(0, 2 * np.pi, 240, endpoint=False)
    x = 16 * np.sin(t) ** 3
    y = 13 * np.cos(t) - 5 * np.cos(2 * t) - 2 * np.cos(3 * t) - np.cos(4 * t)
    s = HEART_W / 32.0
    pts = np.c_[x * s, (y - y.min()) * s]  # bottom tip at y = 0
    return Polygon(pts).buffer(0)


def heart_antenna():
    base = plate(rounded_rect(ANT_PAD, ANT_PAD, PAD_R), PAD_T)
    stem = trimesh.creation.cylinder(radius=STEM_R, height=STEM_H + 2 * OVERLAP, sections=48)
    stem.apply_translation([0, 0, PAD_T + STEM_H / 2])
    heart = standing(heart_outline(), HEART_T, PAD_T + STEM_H - 1.2)
    return trimesh.boolean.union([base, stem, heart], engine="manifold")


def build():
    # The robot's left ear leans toward -X, the right ear toward +X.
    return {
        "CatEarLeft": ear(cat_outline(-CAT_LEAN), cat_inner(-CAT_LEAN)),
        "CatEarRight": ear(cat_outline(CAT_LEAN), cat_inner(CAT_LEAN)),
        "CatEarInnerLeft": insert(cat_inner(-CAT_LEAN)),
        "CatEarInnerRight": insert(cat_inner(CAT_LEAN)),
        "BearEar": ear(bear_outline(), bear_inner()),
        "BearEarInner": insert(bear_inner()),
        "Blush": blush(),
        "HeartAntenna": heart_antenna(),
    }


def main():
    OUT.mkdir(exist_ok=True)
    for name, mesh in build().items():
        assert mesh.is_watertight, f"{name} is not watertight"
        assert mesh.volume > 0, f"{name} has inverted faces"
        assert abs(mesh.bounds[0][2]) < 1e-6, f"{name} does not sit on the bed"
        mesh.export(OUT / f"{name}.stl")
        w, d, h = mesh.extents
        print(f"{name:18s} {w:5.1f} x {d:5.1f} x {h:5.1f} mm")


if __name__ == "__main__":
    main()
