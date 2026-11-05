"""Touch-screen head for the Tiny Engineer desk robot (SG90 build).

Holds a Waveshare 2inch Capacitive Touch LCD (240x320, ST7789 + CST816D,
SKU 29063) in landscape. The servo frame at the back is the stock Tiny
Engineer `Head`, cut off unchanged, so the head servo, the Neck yoke, the
pivot screw and the Hat screws all fit exactly as in the stock build. Only
the small OLED box at the front is replaced by a bigger screen box.

The screen slides in from the top into a groove behind the front frame,
like the stock OLED, and a lid closes the top with two M2x8 screws.
Everything prints upright with no supports.

    pip install trimesh manifold3d shapely mapbox_earcut numpy
    python generate.py

Outputs (stl/):
    TouchHead.stl     - the head (print as exported)
    TouchHeadHat.stl  - stock Hat shortened to end at the screen box
    TouchHeadLid.stl  - lid for the screen box (exported top-down, print as is)

Head coordinates (same as the stock part): X = forward, Y = robot's left,
Z = up, bed at Z = 0. Units: mm.

The stock Head and Hat are downloaded from the Tiny Engineer repository at
a pinned commit and checked against their SHA-256. They are licensed under
CERN-OHL-S-2.0, and so are the parts this script makes from them.
"""

import hashlib
import urllib.request
from pathlib import Path

import numpy as np
import trimesh
from shapely.geometry import Polygon, box

HERE = Path(__file__).parent
OUT = HERE / "stl"
CACHE = HERE / "upstream"

UPSTREAM_COMMIT = "aefc852a894174604a1e350bf9bc04c04f28ec80"
UPSTREAM_URL = f"https://raw.githubusercontent.com/jamro/tiny-engineer/{UPSTREAM_COMMIT}/3d_models/parts/sg90/stl/"
UPSTREAM_SHA256 = {
    "Head.stl": "4570b4ae2d2dd04d851d68e21dd68d6697222d00a11048f940e2a464ef0fcbe2",
    "Hat.stl": "820e46424300205b46c5e28a519d934443fb1212c21627e0aa80e135f90cb27f",
}

# --- where the stock parts are cut -------------------------------------------
FRAME_CUT_X = 11.6      # keep the stock Head for X < this (servo frame, pivot, Hat screws)
HAT_CUT_X = 11.5        # keep the stock Hat for (installed) X < this ...
HAT_HALF_W = 16.45      # ... and only its narrow part (|Y| < this), so no thin fins are left

# --- Waveshare 2inch Capacitive Touch LCD, measured from Waveshare's STEP ----
GLASS_W, GLASS_H, GLASS_T = 58.80, 37.10, 1.35
BODY_DEPTH = 8.80       # behind the glass, up to the tallest part (15-pin connector)
BODY_LOW = 5.98         # glass overhang past the LCD on the connector side
BODY_HIGH = 3.75        # glass overhang past the PCB on the other side
# The connector side of the module faces the robot's right (-Y).

# --- screen box ---------------------------------------------------------------
BACK_X = 11.5           # outer face of the box's back wall
BACK_T = 2.5
REAR_CLR = 1.0          # gap behind the connector
SLOT_CLR = 0.25         # groove clearance in front of / behind the glass
GLASS_CLR = 0.3         # clearance around the glass edges
BEZEL_T = 1.6           # front frame thickness
BEZEL_OVER = 1.2        # how far the front frame covers the glass edge
SIDE_T = 1.6
FLOOR = 2.0
CORNER_R = 3.5
LIP_T = 1.55            # stops behind the glass edges (they take the touch pressure)
LIP_CLR = 0.6           # clearance between those stops and the module body
BOSS = 4.6              # lid screw bosses in the back corners
PILOT_D = 2.1           # M2 pilot (Tiny Engineer default screw_thread_diameter)
PILOT_DEPTH = 9.0
CABLE_Y = (-24.5, -17.0)  # cable notch in the back wall (robot's right), beside the Hat
CABLE_Z0 = 15.0          # above the stock frame (its top is at 14.6), so the frame stays untouched

# --- lid ----------------------------------------------------------------------
LID_T = 2.4
LID_CLEAR_D = 2.4
CBORE_D, CBORE_DEPTH = 4.2, 1.2


def fetch(name):
    CACHE.mkdir(exist_ok=True)
    path = CACHE / name
    if not path.exists():
        with urllib.request.urlopen(UPSTREAM_URL + name) as r:
            path.write_bytes(r.read())
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != UPSTREAM_SHA256[name]:
        raise SystemExit(f"{name}: unexpected SHA-256 {digest}; delete {path} and check the upstream file")
    return trimesh.load(path)


def slab(x0, x1, y0, y1, z0, z1):
    b = trimesh.creation.box(extents=[x1 - x0, y1 - y0, z1 - z0])
    b.apply_translation([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2])
    return b


def prism(poly, z0, z1):
    m = trimesh.creation.extrude_polygon(poly, z1 - z0)
    m.apply_translation([0, 0, z0])
    return m


def cyl(x, y, d, z0, z1):
    c = trimesh.creation.cylinder(radius=d / 2, height=z1 - z0, sections=40)
    c.apply_translation([x, y, (z0 + z1) / 2])
    return c


def union(ms):
    return trimesh.boolean.union(ms, engine="manifold")


def minus(a, b):
    return a.difference(b, engine="manifold")


def layout():
    """All the key positions of the screen box, in head coordinates."""
    L = {}
    L["cav_x0"] = BACK_X + BACK_T
    L["glass_back_x"] = L["cav_x0"] + REAR_CLR + BODY_DEPTH
    L["glass_front_x"] = L["glass_back_x"] + GLASS_T
    L["slot_x0"] = L["glass_back_x"] - SLOT_CLR
    L["bezel_x0"] = L["glass_front_x"] + SLOT_CLR
    L["front_x"] = L["bezel_x0"] + BEZEL_T
    L["in_y"] = GLASS_W / 2 + GLASS_CLR             # inner half-width
    L["out_y"] = L["in_y"] + SIDE_T                 # outer half-width
    L["glass_z0"] = FLOOR
    L["top_z"] = FLOOR + GLASS_H + GLASS_CLR
    L["win_y"] = GLASS_W / 2 - BEZEL_OVER
    L["win_z0"] = FLOOR + BEZEL_OVER
    L["boss_x"] = (L["cav_x0"], L["cav_x0"] + BOSS)
    L["boss_y"] = L["in_y"] - BOSS / 2               # centre, mirrored on both sides
    return L


def build_head(stock_head):
    L = layout()
    frame = stock_head.intersection(slab(-100, FRAME_CUT_X, -100, 100, -1, 100), engine="manifold")

    outline = box(BACK_X, -L["out_y"], L["front_x"], L["out_y"]).buffer(-CORNER_R).buffer(CORNER_R, quad_segs=12)
    shell = prism(outline, 0, L["top_z"])

    cavity = union([
        slab(L["cav_x0"], L["bezel_x0"], -L["in_y"], L["in_y"], FLOOR, L["top_z"] + 1),      # body + glass groove
        slab(L["bezel_x0"] - 0.1, L["front_x"] + 1, -L["win_y"], L["win_y"], L["win_z0"], L["top_z"] + 1),  # window, open at the top
    ])
    box_solid = minus(shell, cavity)

    lip_x = (L["slot_x0"] - LIP_T, L["slot_x0"])
    low_end = -GLASS_W / 2 + BODY_LOW - LIP_CLR
    high_start = GLASS_W / 2 - BODY_HIGH + LIP_CLR
    adds = [
        slab(lip_x[0], lip_x[1] + 0.01, -L["in_y"] - 0.01, low_end, FLOOR - 0.01, L["top_z"]),
        slab(lip_x[0], lip_x[1] + 0.01, high_start, L["in_y"] + 0.01, FLOOR - 0.01, L["top_z"]),
    ]
    for s in (-1, 1):
        y0, y1 = sorted((s * (L["in_y"] + 0.01), s * (L["in_y"] - BOSS)))
        adds.append(slab(L["boss_x"][0] - 0.01, L["boss_x"][1], y0, y1, FLOOR - 0.01, L["top_z"]))
    head = union([frame, box_solid, *adds])

    cuts = [slab(BACK_X - 1, L["cav_x0"] + 0.5, CABLE_Y[0], CABLE_Y[1], CABLE_Z0, L["top_z"] + 1)]
    bx = (L["boss_x"][0] + L["boss_x"][1]) / 2
    for s in (-1, 1):
        cuts.append(cyl(bx, s * L["boss_y"], PILOT_D, L["top_z"] - PILOT_DEPTH, L["top_z"] + 1))
    for c in cuts:
        head = minus(head, c)
    return clean(head, "TouchHead")


def build_hat(stock_hat, stock_head):
    # Installed, the Hat's back edge lines up with the Head's back edge.
    shift = stock_head.bounds[0][0] - stock_hat.bounds[0][0]
    cut = HAT_CUT_X - shift
    hat = stock_hat.intersection(slab(-100, cut, -HAT_HALF_W, HAT_HALF_W, -1, 100), engine="manifold")
    return clean(hat, "TouchHeadHat"), shift


def build_lid():
    L = layout()
    outline = box(BACK_X, -L["out_y"], L["front_x"], L["out_y"]).buffer(-CORNER_R).buffer(CORNER_R, quad_segs=12)
    plate = prism(outline, L["top_z"], L["top_z"] + LID_T)
    # Bar that drops into the top of the window and covers the glass's top edge.
    bar = slab(L["bezel_x0"] + 0.15, L["front_x"], -L["win_y"] + 0.15, L["win_y"] - 0.15,
               L["top_z"] - BEZEL_OVER - GLASS_CLR, L["top_z"] + 0.01)
    lid = union([plate, bar])
    bx = (L["boss_x"][0] + L["boss_x"][1]) / 2
    for s in (-1, 1):
        lid = minus(lid, cyl(bx, s * L["boss_y"], LID_CLEAR_D, L["top_z"] - 5, L["top_z"] + LID_T + 1))
        lid = minus(lid, cyl(bx, s * L["boss_y"], CBORE_D, L["top_z"] + LID_T - CBORE_DEPTH, L["top_z"] + LID_T + 1))
    return clean(lid, "TouchHeadLid")


def clean(mesh, name):
    with np.errstate(all="ignore"):
        pieces = [p for p in mesh.split(only_watertight=False) if abs(p.volume) > 1.0]
    assert len(pieces) == 1, f"{name} came out in {len(pieces)} pieces"
    m = pieces[0]
    assert m.is_watertight and m.volume > 0, name
    return m


def lid_print_pose(lid):
    """Flip the lid top-down so its flat top sits on the bed."""
    m = lid.copy()
    m.apply_transform(trimesh.transformations.rotation_matrix(np.pi, [1, 0, 0]))
    m.apply_translation([0, 0, -m.bounds[0][2]])
    return m


def main():
    OUT.mkdir(exist_ok=True)
    stock_head, stock_hat = fetch("Head.stl"), fetch("Hat.stl")
    head = build_head(stock_head)
    hat, _ = build_hat(stock_hat, stock_head)
    lid = build_lid()
    head.export(OUT / "TouchHead.stl")
    hat.export(OUT / "TouchHeadHat.stl")
    lid_print_pose(lid).export(OUT / "TouchHeadLid.stl")
    for name, m in (("TouchHead", head), ("TouchHeadHat", hat), ("TouchHeadLid", lid)):
        w, d, h = m.extents
        print(f"{name:13s} {w:5.1f} x {d:5.1f} x {h:5.1f} mm  ~{m.volume / 1000 * 1.24:4.0f} g PLA")


if __name__ == "__main__":
    main()
