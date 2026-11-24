"""Pixel Phone: a small beige CRT monitor, in the style of Pixel (pixel-desk/), that holds a phone as its screen.

The phone lies in landscape in a swappable insert (the "support"): reprint only the insert for another phone or
for a phone in a case. A round magnetic Qi2 ("MagSafe-type") wireless charger sits in the insert, right behind
the phone, so the phone charges while it shows Pixel's face. A 90 deg USB-C cable works too (right scoop, then
back through the insert and out of the CRT back).

Parts (stl/), each exported in its print orientation, no supports needed:
    PixelPhoneFront.stl              bezel with the bay for the insert (prints face-up: its back on the plate)
    PixelPhoneBack.stl               tapered CRT back with vents, screwed on the bezel (prints back-down)
    PixelPhoneStand.stl              round foot with a tilting neck: the monitor leans back TILT deg (prints upright)
    PixelPhoneSupport_<phone>.stl    the swappable insert for a bare phone (prints face-up)
    PixelPhoneSupport_<phone>_Coque.stl   the same for a phone in a thin case (CASE)
    PhoneFitTest_<phone>[_Coque].stl the insert's left end, cut short: check the phone and its camera first
    PuckFitTest.stl                  the charger's pocket, cut short: check the charger first

    pip install trimesh manifold3d shapely mapbox_earcut numpy scipy networkx matplotlib pillow
    python3 generate.py            # then: python3 tools/verify.py

Coordinates of the monitor (before it leans back on its foot): X = left/right, Y = front (0, the bezel's face)
to back, Z = up (0, the bezel's bottom edge). Units: mm. The foot is drawn in the world frame (desk at z = 0):
to_world() leans the monitor back by TILT and lifts it onto the foot.
The phone, seen from the front, in landscape with its USB-C port on the right: u from its left end, v up from its
bottom edge, w from the glass to the back. Values marked [estimate] are not published by the maker: the fit test
checks them on the real phone.
"""

from math import cos, radians, sin, tan
from pathlib import Path

import numpy as np
import trimesh
from shapely import affinity
from shapely.geometry import Point, Polygon, box
from shapely.ops import unary_union

OUT = Path(__file__).parent / "stl"

# ------------------------------------------------------------------ phones
# Seen from the front in landscape, USB-C on the right ("landscape" in Android: the phone turned a quarter turn to
# the left). For the Galaxy S25 Ultra that puts the buttons on the top edge, the S Pen and the USB-C port at the
# right end, the back camera at the top left (seen from the front), and nothing on the bottom edge.
PHONES = {
    "S25U": dict(
        name="Samsung Galaxy S25 Ultra",
        L=162.8, W=77.6, T=8.2, mass=218.0,              # Samsung's specs
        R=9.0,                                           # corner radius seen from the front [estimate]
        screen=(159.1, 73.4),                            # 6.9" 3120 x 1440 picture (the 6.9" is its full rectangle)
        # Back camera, in portrait seen from the BACK: (x from the back's left edge, y from the top edge, diameter,
        # height above the back glass) [estimate]. 3 big lens rings in a column, the 5x periscope, flash, laser AF.
        camera=[(19.5, 18.5, 16.0, 2.4), (19.5, 37.0, 16.0, 2.4), (19.5, 55.5, 16.0, 2.4), (37.5, 19.5, 13.0, 2.4),
                (37.5, 33.5, 7.0, 0.5), (37.5, 42.0, 5.5, 0.5)],
        keys=[(33.0, 61.0), (68.0, 82.0)],               # volume, power: right edge in portrait, mm from the top [estimate]
        key_h=0.6,                                       # how far they stick out
        usb_v=38.8,                                      # USB-C: centre of the bottom edge (portrait)
        coil_u=89.0,                                     # wireless charging coil: centred across, this far from the top
                                                         # (portrait), just under the camera [estimate]
    ),
}
PHONE = "S25U"

# a thin case (the "_Coque" insert): wall on the sides, on the back, and its lip in front of the screen
CASE = dict(side=1.6, back=1.6, front=1.0, cam_lip=1.4, cam_rim=2.5)   # cam_lip: the case's ring around the camera
NO_CASE = dict(side=0.0, back=0.0, front=0.0, cam_lip=0.0, cam_rim=0.0)

# ------------------------------------------------------------------ wireless charger
# A round magnetic Qi2 charger ("MagSafe-type" puck, 15 W): Anker MagGo, Belkin BoostCharge Pro, ESR HaloLock...
# about 55-60 mm across and 5-8 mm thick, cable out of its edge. The S25 Ultra has no magnets (it is "Qi2 Ready"):
# the insert holds the phone, the charger only charges it. Its pocket is a slot: slide the charger along it until
# the phone charges (the coil's place is an estimate), then stick it there with 0.5 mm foam tape.
PUCK_D, PUCK_T = 60.0, 7.0
PUCK_CLR = 0.4                    # pocket: on the radius
PUCK_RECESS = 0.3                 # the charger's face is this far behind the phone's back (the phone rests on the insert)
PUCK_TAPE = 0.5                   # 0.5 mm double-sided foam under it (pixel-desk's): it stays where it charges best
PUCK_BACK = 1.2                   # plastic behind the charger
PUCK_SLIDE = 12.0                 # length of the slot
PUCK_CAM_GAP = 3.0                # the charger stays this far from the camera
PUCK_RELIEF = (6.5, 12.0)         # its cable's stiff boot at the edge: diameter, length
PUCK_CABLE_D = 4.0
PUCK_BACK_HOLE = 11.0             # hole in the back of the pocket, for chargers whose cable leaves from the back
PUCK_MASS = 50.0                  # with its cable [estimate]

# ------------------------------------------------------------------ the insert (swappable phone support)
FUNNEL = 3.5                      # 45 deg funnel from the face down to the phone: the screen is sunken, like a CRT
GLASS_BACK = 0.3                  # the phone's front is this far behind the funnel's edge
END_CLR = 0.8                     # around the phone: at each end
TOP_CLR = 0.8                     # above it; it rests on the bottom wall
KEY_RELIEF = 1.0                  # groove in the top wall over the side keys (they are on the top edge)
WELL_R = 4.0                      # corners of the well: smaller than the phone's, so its corners never touch
CAM_CLR = 3.0                     # around the camera, in the support
CAM_DEPTH = 3.2                   # depth of the camera pocket (camera 2.4 + 0.8)
RIM_MIN = 1.0                     # flat rim of the insert, flush with the bezel's face
INSERT_CLR = 0.3                  # insert to bay, per side
INSERT_RIB = 0.35                 # crush ribs on the insert's sides: they touch the bay (a snug fit)
INSERT_CHAMFER = 0.6
EXIT = (16.0, 8.5)                # cable exit through the insert's back, after the groove: length (along u), width
SCOOP_H = 20.0                    # finger scoops at both ends of the phone, at its mid-height: lift it out by its ends
USB_SLOT_H = 12.0                 # option: a 90 deg USB-C cable goes back through the insert's right end

# ------------------------------------------------------------------ monitor (bezel + CRT back + foot)
TILT = 15.0                       # the monitor leans back on its foot
BAY_W, BAY_H, BAY_R = 179.0, 93.0, 1.5      # bay for the inserts: phone + case up to about 167.8 x 82.6 mm
INSERT_D = 24.0                   # bay depth (all inserts are this thick): phones up to about 9 mm + case
LEDGE_W, LEDGE_T = 5.0, 4.5       # the ledge at the back of the bay: the insert rests on it
EAR = 12.0                        # the ledge is wider in the 4 corners: the back's 4 screws go through there
SIDE, TOP, CHIN = 10.0, 11.0, 21.0  # bezel around the bay
BEZ_W, BEZ_H = BAY_W + 2 * SIDE, CHIN + BAY_H + TOP
BEZ_D = INSERT_D + LEDGE_T
BEZ_R, BEZ_CHAMFER = 7.0, 1.5
SCOOP_IN, SCOOP_D = 6.0, 15.0     # the finger scoops go on into the bezel's border: this far; and this deep (in the
                                  # insert too, past the phone's end: one flat floor)
CABLE_CH = (3.0, 7.0)             # USB-C cable option: a channel in the bay's side walls, from the scoop back to the
                                  # ledge (how far into the wall, height), at mid-height on both sides
LEDGE_NOTCH = 12.0                # ... and a notch in the ledge there
STEP = 2.0                        # the CRT back is this much smaller than the bezel
HOOD_D, HOOD_R = 45.0, 8.0
TAPER_W, TAPER_H = 30.0, 20.0     # its rear end is this much narrower / lower
WALL = 1.6
POST_D, POST_RIB = 7.0, 2.4       # posts inside the back for the 4 screws from the bezel
SCREW_IN = 7.0                    # screws: this far from the bay's corner edges (in the ledge's ears)
PILOT, CLEAR = 2.2, 2.8           # M2.5 self-tapping pilot / clearance
CBORE_D, CBORE_H = 5.4, 2.4       # screw-head pockets in the ledge (the insert covers them)
REAR_NOTCH = (9.0, 11.0)          # the charger's cable leaves the back here: width, height (open at the bottom)

# foot (world frame: desk at z = 0)
STAND_D, STAND_H, STAND_CHAMFER = 110.0, 10.0, 3.0
NECK_W, NECK_D, NECK_R = 64.0, 40.0, 8.0
NECK_MIN = 4.5                    # neck height at its back end (the monitor leans back over it)
FOOT_Y = 44.0                     # centre of the foot, behind the bezel's bottom front edge (world y): a bit behind
                                  # the centre of mass, so a tap on the screen does not tip it over
FOOT_SCREW_X = 18.0
OVER = 0.01


# ------------------------------------------------------------------ helpers (as in pixel-desk/generate.py)
def rrect(w, h, r, cx=0.0, cy=0.0):
    r = min(r, w / 2 - 0.01, h / 2 - 0.01)
    if r <= 0.02:
        return box(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2)
    return box(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2).buffer(-r).buffer(r, quad_segs=16)


def ext_xy(poly, z0, z1):
    m = trimesh.creation.extrude_polygon(poly, z1 - z0)
    m.apply_translation([0, 0, z0])
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


def single(mesh, name):
    """The part as one clean body: manifold's simplify (0.01 micron) removes the zero-area slivers that booleans
    leave where two faces nearly meet."""
    import manifold3d as m3
    with np.errstate(all="ignore"):
        pieces = [p for p in mesh.split(only_watertight=False) if abs(p.volume) > 1.0]
    assert len(pieces) == 1, f"{name}: {len(pieces)} pieces"
    m = pieces[0]
    mm = m3.Manifold(m3.Mesh(vert_properties=np.asarray(m.vertices, np.float32), tri_verts=np.asarray(m.faces, np.uint32)))
    out = mm.simplify(1e-5).to_mesh()
    m = trimesh.Trimesh(vertices=np.asarray(out.vert_properties)[:, :3], faces=np.asarray(out.tri_verts), process=True)
    assert m.is_watertight and m.volume > 0, name
    return m


def text_poly(txt, size, x, y):
    """Bold text outline as a shapely geometry, bottom-left at (x, y)."""
    from matplotlib.font_manager import FontProperties
    from matplotlib.textpath import TextPath
    tp = TextPath((0, 0), txt, size=size, prop=FontProperties(family="DejaVu Sans", weight="bold"))
    geom = Polygon()
    for ring_ in tp.to_polygons():
        if len(ring_) >= 3:
            geom = geom.symmetric_difference(Polygon(ring_).buffer(0))
    return affinity.translate(geom, x, y)


def text_centred(txt, size, x, y, mirror=False):
    g = text_poly(txt, size, 0, 0)
    x0, y0, x1, y1 = g.bounds
    g = affinity.translate(g, -(x0 + x1) / 2, -(y0 + y1) / 2)
    if mirror:
        g = affinity.scale(g, -1, 1, origin=(0, 0))
    return affinity.translate(g, x, y)


def ring(cx, cy, d_out, d_in):
    return Point(cx, cy).buffer(d_out / 2, quad_segs=24).difference(Point(cx, cy).buffer(d_in / 2, quad_segs=24))


def disc(cx, cy, d):
    return Point(cx, cy).buffer(d / 2, quad_segs=24)


def stadium(x0, x1, y, r):
    """Slot: the round end centres at x0 and x1, both at height y, radius r."""
    return unary_union([Point(x0, y).buffer(r, quad_segs=32), Point(x1, y).buffer(r, quad_segs=32),
                        box(x0, y - r, x1, y + r)])


def parts_of(geom):
    return [g for g in getattr(geom, "geoms", [geom]) if g.area > 0.01]


def engrave_front(poly_xz, y_face, depth):
    """Engrave a shape drawn in (X, Z) into a face that looks towards -Y at y = y_face."""
    return U([ext_xz(g, y_face - 1.0, y_face + depth) for g in parts_of(poly_xz)])


def engrave_back(poly_xz, y_face, depth):
    """Engrave a shape drawn in (X, Z) (as seen from the back) into a face that looks towards +Y at y = y_face."""
    return U([ext_xz(g, y_face - depth, y_face + 1.0) for g in parts_of(poly_xz)])


def filament_g(m, walls=3, line=0.42, infill=0.15, density=1.24):
    """Slicer-like estimate: 3 perimeters (and top/bottom skins) of 0.42 mm on the whole surface, `infill` inside.
    PLA, grams."""
    v = abs(m.volume)
    shell = min(v, m.area * walls * line)
    return (shell + infill * (v - shell)) * density / 1000.0


# ------------------------------------------------------------------ monitor frame <-> world (the foot, the desk)
def lift():
    """Height of the bezel's bottom front edge above the desk: the hood's bottom clears the foot's top by
    NECK_MIN at the back of the neck."""
    return STAND_H + NECK_MIN + (FOOT_Y + NECK_D / 2) * tan(radians(TILT))


def to_world():
    """Monitor frame -> world: lean back by TILT about the bezel's bottom front edge, then lift onto the foot."""
    R = trimesh.transformations.rotation_matrix(-radians(TILT), [1, 0, 0])
    return trimesh.transformations.translation_matrix([0, 0, lift()]) @ R


def world(m):
    mm = m.copy(); mm.apply_transform(to_world()); return mm


def from_world(m):
    mm = m.copy(); mm.apply_transform(np.linalg.inv(to_world())); return mm


def bay_z():
    return CHIN + BAY_H / 2


def phone_mid_z():
    """Height of the phone's middle in the bay, whatever the insert (the well is centred, the phone sits on its
    bottom wall, TOP_CLR above it)."""
    return bay_z() - TOP_CLR / 2


def screw_xz():
    """The back's 4 screws, through the ledge's ears, seen from the front."""
    hx, hz = BAY_W / 2 - SCREW_IN, BAY_H / 2 - SCREW_IN
    return [(sx * hx, bay_z() + sz * hz) for sx in (-1, 1) for sz in (-1, 1)]


def foot_screw_y():
    """Y of the 2 screws between the CRT back's floor and the foot's neck (monitor frame, on the back's floor)."""
    return FOOT_Y / cos(radians(TILT))


# ------------------------------------------------------------------ insert layout
def layout(phone_key=PHONE, case=NO_CASE):
    """Where everything of an insert is, in the monitor frame. The phone frame (u, v, w) maps to
    X = x0 + u, Z = z0 + v, Y = y_glass + w."""
    p = PHONES[phone_key]
    cs, cb, cf = case["side"], case["back"], case["front"]
    Lc, Wc, Tc = p["L"] + 2 * cs, p["W"] + 2 * cs, p["T"] + cb + cf
    well_w, well_h = Lc + 2 * END_CLR, Wc + TOP_CLR
    z_w0 = bay_z() - well_h / 2
    y_front = FUNNEL + GLASS_BACK
    y_pb = y_front + Tc
    lo = dict(p=p, case=case, Lc=Lc, Wc=Wc, Tc=Tc, well_w=well_w, well_h=well_h, z_w0=z_w0,
              well_zc=z_w0 + well_h / 2, y_front=y_front, y_pb=y_pb,
              x0=-p["L"] / 2, z0=z_w0 + cs, y_glass=y_front + cf,
              out_w=BAY_W - 2 * INSERT_CLR, out_h=BAY_H - 2 * INSERT_CLR)
    lo["rim_x"] = (lo["out_w"] - well_w) / 2 - FUNNEL
    lo["rim_z"] = (lo["out_h"] - well_h) / 2 - FUNNEL
    lo["puck_y"] = (y_pb + PUCK_RECESS, y_pb + PUCK_RECESS + PUCK_T)     # the charger's face and back
    lo["pocket_y"] = lo["puck_y"][1] + PUCK_TAPE                          # the pocket's floor, under the foam
    lo["floor"] = INSERT_D - y_pb
    lo["cam"] = camera_features(p, case)
    lo["puck_u"] = puck_range(lo)
    return lo


def back_uv(p, xb, yt):
    """Portrait, seen from the back (x from the back's left edge, y from the top) -> landscape (u, v) seen from the
    front, USB-C on the right."""
    return yt, p["W"] - xb


def camera_features(p, case):
    """Camera features as (shape in (u, v), height above the phone's back). With a case: the case's ring around
    the camera, cam_rim wider than the lenses, cam_lip above the case's back."""
    feats = [(disc(*back_uv(p, x, y), d), h) for x, y, d, h in p["camera"]]
    if case["cam_lip"] > 0:
        rim = unary_union([f.buffer(case["cam_rim"], quad_segs=16) for f, h in feats if h > 1.0]).convex_hull
        feats.append((rim, case["back"] + case["cam_lip"]))
    return feats


def puck_range(lo):
    """Slot of the charger along u (phone frame): from the closest place to the camera that leaves PUCK_CAM_GAP,
    PUCK_SLIDE long. The charger is centred on the phone's height."""
    p = lo["p"]
    vc = p["W"] / 2
    r = PUCK_D / 2 + PUCK_CAM_GAP
    u_min = p["coil_u"] - PUCK_SLIDE / 2
    for shape, h in lo["cam"]:
        if h <= PUCK_RECESS + lo["case"]["back"]:      # flush with the back (or under the case's back): no matter
            continue
        # smallest u where a disc of radius r at height vc stays clear of the shape
        lo_u, hi_u = 0.0, p["L"]
        for _ in range(40):
            mid = (lo_u + hi_u) / 2
            if Point(mid, vc).buffer(r, quad_segs=32).intersects(shape):
                lo_u = mid
            else:
                hi_u = mid
        u_min = max(u_min, hi_u)
    u_min = np.ceil(u_min * 2) / 2
    return u_min, u_min + PUCK_SLIDE


def uv_to_xz(lo, u, v):
    return lo["x0"] + u, lo["z0"] + v


def shape_to_xz(lo, shape):
    return affinity.translate(shape, lo["x0"], lo["z0"])


# ------------------------------------------------------------------ the insert
def insert_outer(lo):
    c = INSERT_CHAMFER
    w, h, r = lo["out_w"], lo["out_h"], BAY_R - INSERT_CLR
    return hull(ext_xz(rrect(w - 2 * c, h - 2 * c, r, 0, bay_z()), 0, OVER),
                ext_xz(rrect(w, h, r, 0, bay_z()), c, INSERT_D - c),
                ext_xz(rrect(w - 2 * c, h - 2 * c, r, 0, bay_z()), INSERT_D - OVER, INSERT_D))


def insert_ribs(lo):
    """Crush ribs on the insert's 4 sides: they touch the bay walls."""
    w, h, zc = lo["out_w"], lo["out_h"], bay_z()
    t, y0, y1 = INSERT_RIB, 2.0, INSERT_D - 2.0
    out = []
    for s in (-1, 1):
        for dz in (-30.0, 30.0):                      # left and right sides (away from the scoops)
            out.append(slab(min(s * (w / 2 - 0.5), s * (w / 2 + t)), max(s * (w / 2 - 0.5), s * (w / 2 + t)),
                            y0, y1, zc + dz - 1.5, zc + dz + 1.5))
        for x in (-55.0, 55.0):                       # top and bottom
            out.append(slab(x - 1.5, x + 1.5, y0, y1, min(zc + s * (h / 2 - 0.5), zc + s * (h / 2 + t)),
                            max(zc + s * (h / 2 - 0.5), zc + s * (h / 2 + t))))
    return out


def well_cut(lo):
    """Funnel (45 deg, FUNNEL deep) and the well down to the support plane."""
    ww, wh, zc = lo["well_w"], lo["well_h"], lo["well_zc"]
    funnel = hull(ext_xz(rrect(ww, wh, WELL_R, 0, zc), FUNNEL - OVER, FUNNEL + OVER),
                  ext_xz(rrect(ww + 2 * (FUNNEL + 1), wh + 2 * (FUNNEL + 1), WELL_R + FUNNEL + 1, 0, zc), -1.0, -1.0 + OVER))
    return [funnel, ext_xz(rrect(ww, wh, WELL_R, 0, zc), FUNNEL - 0.02, lo["y_pb"])]


def scoop_cuts(lo):
    """Finger scoops at both ends of the phone, at its mid-height: through the insert's end walls, from the face
    down to the support plane. Plus a groove in the top wall over the side keys."""
    zc = phone_mid_z()
    out = []
    for s in (-1, 1):
        x_in = s * (lo["well_w"] / 2 - 1.0)
        x_out = s * (lo["out_w"] / 2 + 1.0)
        prof = rrect(abs(x_out - x_in) + 8.0, SCOOP_H, 4.0, (x_in + x_out) / 2 + s * 4.0, zc)
        out.append(ext_xz(prof, -1.0, lo["y_pb"]))
        x_end = s * (lo["well_w"] / 2 + 0.5)                          # past the phone's end: down to SCOOP_D
        if SCOOP_D > lo["y_pb"]:
            prof = rrect(abs(x_out - x_end) + 8.0, SCOOP_H, 4.0, (x_end + x_out) / 2 + s * 4.0, zc)
            out.append(ext_xz(prof, -1.0, SCOOP_D))
    p, cs = lo["p"], lo["case"]["side"]
    top = lo["z_w0"] + lo["well_h"]
    xa, _ = uv_to_xz(lo, min(a for a, _ in p["keys"]) - cs - 3.0, 0)
    xb, _ = uv_to_xz(lo, max(b for _, b in p["keys"]) + cs + 3.0, 0)
    out.append(slab(xa, xb, FUNNEL + 0.5, lo["y_pb"], top - 1.0, top + KEY_RELIEF))
    return out


def usb_slot_cut(lo):
    """Option: a 90 deg USB-C plug in the phone's port with its cable going back, through the insert's right end
    (then through the ledge's notch into the CRT back)."""
    p, cs = lo["p"], lo["case"]["side"]
    x0, z = uv_to_xz(lo, p["L"] + cs + 1.0, p["usb_v"])
    x1 = lo["out_w"] / 2 + 1.0
    return ext_xz(rrect(x1 - x0, USB_SLOT_H, 2.0, (x0 + x1) / 2, z), lo["y_pb"] - 0.02, INSERT_D + 1)


def puck_slot_xz(lo, grow=0.0):
    """The charger's slot seen from the front (X, Z)."""
    p = lo["p"]
    u0, u1 = lo["puck_u"]
    xa, z = uv_to_xz(lo, u0, p["W"] / 2)
    xb, _ = uv_to_xz(lo, u1, p["W"] / 2)
    return stadium(xa, xb, z, PUCK_D / 2 + PUCK_CLR + grow)


def puck_cuts(lo):
    """The charger's slot, its cable groove to the right and the exit through the back, and a hole in the
    pocket's back for chargers whose cable leaves from their back."""
    p = lo["p"]
    u0, u1 = lo["puck_u"]
    vc = p["W"] / 2
    y_back = lo["pocket_y"]
    xa, z = uv_to_xz(lo, u0, vc)
    xb, _ = uv_to_xz(lo, u1, vc)
    cuts = [ext_xz(puck_slot_xz(lo), lo["y_pb"] - 0.02, y_back)]
    cuts.append(ext_xz(stadium(xa, xb, z, PUCK_BACK_HOLE / 2), y_back - 1, INSERT_D + 1))
    # groove from the slot to the right, as deep as the pocket, then the exit
    gw = PUCK_RELIEF[0] + 1.0
    ex0, ex1 = exit_u(lo)
    xe0, _ = uv_to_xz(lo, ex0, vc)
    xe1, _ = uv_to_xz(lo, ex1, vc)
    cuts.append(slab(xa, xe1, lo["y_pb"] - 0.02, y_back, z - gw / 2, z + gw / 2))
    cuts.append(ext_xz(rrect(xe1 - xe0, EXIT[1], EXIT[1] / 2 - 0.01, (xe0 + xe1) / 2, z), y_back - 1, INSERT_D + 1))
    return cuts


def exit_u(lo):
    """The cable's exit through the insert's back (phone frame u): after the boot of a charger pushed to the right
    end of its slot, and a bend."""
    u1 = lo["puck_u"][1] + PUCK_D / 2 + PUCK_RELIEF[1] + 1.0
    return u1 - EXIT[0], u1


def build_insert(phone_key=PHONE, case=NO_CASE, name=None):
    lo = layout(phone_key, case)
    assert lo["rim_x"] >= RIM_MIN - 1e-6 and lo["rim_z"] >= RIM_MIN - 1e-6, f"phone too big for the bay: {lo['rim_x']:.2f} {lo['rim_z']:.2f}"
    assert lo["floor"] >= PUCK_RECESS + PUCK_T + PUCK_TAPE + PUCK_BACK - 1e-6, f"bay too shallow: floor {lo['floor']:.2f}"
    body = U([insert_outer(lo), *insert_ribs(lo)])
    cuts = well_cut(lo) + scoop_cuts(lo) + puck_cuts(lo) + [usb_slot_cut(lo)]
    # camera pocket: the lenses (or the case's ring) with CAM_CLR around, joined into one round shape; where it
    # comes close to the charger's slot, the two pockets join (no thin wall between them)
    cam = unary_union([shape_to_xz(lo, f.buffer(CAM_CLR, quad_segs=16)) for f, h in lo["cam"]]).convex_hull
    cam = unary_union([cam, puck_slot_xz(lo)]).buffer(1.0, quad_segs=16).buffer(-1.0, quad_segs=16)
    cuts.append(ext_xz(cam, lo["y_pb"] - 0.02, lo["y_pb"] + CAM_DEPTH))
    # name on the back (read from behind)
    label = PHONES[phone_key]["name"].replace("Samsung Galaxy ", "").upper() + (" COQUE" if case["side"] > 0 else "")
    cuts.append(engrave_back(text_centred(label, 5.0, -40.0, bay_z() - 30.0, mirror=True), INSERT_D, 0.6))
    return single(D(body, *cuts), name or "insert"), lo


def build_phone_test(phone_key=PHONE, case=NO_CASE, name="PhoneFitTest"):
    """The insert's left end, cut short (the camera end): rim, funnel, well and its walls, the camera pocket and
    the left scoop, on 1.2 mm of floor under the camera pocket."""
    ins, lo = build_insert(phone_key, case, name)
    u_cut = max(f.bounds[2] for f, _ in lo["cam"]) + CAM_CLR + 8.0
    x_cut, _ = uv_to_xz(lo, u_cut, 0)
    y_back = lo["y_pb"] + CAM_DEPTH + 1.2
    keep = slab(-BAY_W, x_cut, -1, y_back, -100, 300)
    test = I(ins, keep)
    label = text_centred("TEST", 4.0, (-lo["out_w"] / 2 + x_cut) / 2, bay_z() - lo["well_h"] / 2 + 12.0, mirror=True)
    return single(D(test, engrave_back(label, y_back, 0.6)), name), lo


def build_puck_test(phone_key=PHONE, case=NO_CASE):
    """The charger's slot alone, as in the insert: a plate as deep as the pocket and its floor, a 2.4 mm rim, the
    hole in the floor and the start of the cable's groove. The charger must drop in with a little play; on the
    0.5 mm foam, its face sits PUCK_RECESS under the top."""
    lo = layout(phone_key, case)
    p = lo["p"]
    u0, u1 = lo["puck_u"]
    xa, z = uv_to_xz(lo, u0, p["W"] / 2)
    xb, _ = uv_to_xz(lo, u1, p["W"] / 2)
    y0, y_puck = lo["y_pb"], lo["pocket_y"]
    y1 = y_puck + PUCK_BACK
    r = PUCK_D / 2 + PUCK_CLR
    gw = PUCK_RELIEF[0] + 1.0
    plate = ext_xz(stadium(xa, xb, z, r + 2.4), y0, y1)
    cuts = [ext_xz(stadium(xa, xb, z, r), y0 - 1, y_puck), ext_xz(stadium(xa, xb, z, PUCK_BACK_HOLE / 2), y_puck - 1, y1 + 1),
            slab(xb, xb + r + 5, y0 - 1, y_puck, z - gw / 2, z + gw / 2)]
    return single(D(plate, *cuts), "PuckFitTest"), lo


# ------------------------------------------------------------------ bezel
def ledge_opening():
    """The ledge at the back of the bay, minus its 4 corner ears (with a 45 deg chamfer)."""
    op = rrect(BAY_W - 2 * LEDGE_W, BAY_H - 2 * LEDGE_W, 1.0, 0, bay_z())
    for sx in (-1, 1):
        for sz in (-1, 1):
            cx, cz = sx * BAY_W / 2, bay_z() + sz * BAY_H / 2
            e = Polygon([(cx, cz), (cx - sx * EAR, cz), (cx - sx * EAR, cz - sz * (EAR - 4.0)),
                         (cx - sx * (EAR - 4.0), cz - sz * EAR), (cx, cz - sz * EAR)])
            op = op.difference(e)
    return op


def build_front():
    c = BEZ_CHAMFER
    zc = BEZ_H / 2
    body = hull(ext_xz(rrect(BEZ_W - 2 * c, BEZ_H - 2 * c, BEZ_R - c, 0, zc), 0, OVER),
                ext_xz(rrect(BEZ_W, BEZ_H, BEZ_R, 0, zc), c, BEZ_D))
    cuts = [ext_xz(rrect(BAY_W, BAY_H, BAY_R, 0, bay_z()), -1.0, INSERT_D),
            ext_xz(ledge_opening(), INSERT_D - 0.5, BEZ_D + 1.0)]
    zn = phone_mid_z()
    for s in (-1, 1):                                                  # finger scoops, and the ledge's cable notches
        cuts.append(ext_xz(rrect(2 * SCOOP_IN, SCOOP_H, 4.0, s * BAY_W / 2, zn), -1.0, SCOOP_D))
        ci, ch = CABLE_CH
        cuts.append(ext_xz(rrect(2 * ci, ch, ci - 0.01, s * BAY_W / 2, zn), SCOOP_D - 1.0, INSERT_D + 0.5))
        x_in, x_out = s * (BAY_W / 2 - LEDGE_W - 1.0), s * (BAY_W / 2 + ci)
        cuts.append(ext_xz(rrect(abs(x_out - x_in), LEDGE_NOTCH, 2.0, (x_in + x_out) / 2, zn), INSERT_D - 0.5, BEZ_D + 1))
    for x, z in screw_xz():                                            # the back's 4 screws, heads under the insert
        cuts += [cyl_y(x, z, INSERT_D - 0.5, INSERT_D + CBORE_H, CBORE_D), cyl_y(x, z, INSERT_D, BEZ_D + 1, CLEAR)]
    # engraved under the screen, like Pixel's monitor: badge, three knobs, a LED and the power button
    zk = CHIN / 2
    xr = BEZ_W / 2
    det = [text_poly("PIXEL", 7.0, -xr + 12.5, zk - 3.3), ring(xr - 58, zk, 4.6, 3.0), ring(xr - 50, zk, 4.6, 3.0),
           ring(xr - 42, zk, 4.6, 3.0), rrect(5.0, 1.8, 0.6, xr - 32.5, zk), ring(xr - 20.5, zk, 17.0, 15.6),
           disc(xr - 20.5, zk, 9.0)]
    for d_ in det:
        cuts.append(engrave_front(d_, 0.0, 0.7))
    return single(D(body, *cuts), "PixelPhoneFront")


# ------------------------------------------------------------------ CRT back
def hood_solid(inset=0.0, open_front=False):
    f = BEZ_D
    wf, hf = BEZ_W - 2 * STEP, BEZ_H - 2 * STEP
    wr, hr = wf - TAPER_W, hf - TAPER_H

    def sl(w, h, y0, y1):
        return ext_xz(rrect(w - 2 * inset, h - 2 * inset, max(1.0, HOOD_R - inset), 0, h / 2), y0, y1)
    y_front = f - (1.0 if open_front else 0.0)
    return hull(sl(wf, hf, y_front, y_front + OVER), sl(wr, hr, f + HOOD_D - inset - OVER, f + HOOD_D - inset))


def hood_size(y):
    """Outer half-width and height of the CRT back at depth y (it tapers linearly)."""
    t = min(max((y - BEZ_D) / HOOD_D, 0.0), 1.0)
    wf, hf = BEZ_W - 2 * STEP, BEZ_H - 2 * STEP
    return (wf - TAPER_W * t) / 2, hf - TAPER_H * t


def build_back():
    f = BEZ_D
    outer = hood_solid()
    shell = D(outer, hood_solid(WALL, open_front=True))
    adds = []
    y_end = f + HOOD_D - 0.4
    for x, z in screw_xz():                                            # posts for the 4 screws, with 2 ribs each
        sx, sz = np.sign(x), np.sign(z - bay_z())
        r = POST_RIB / 2
        adds.append(cyl_y(x, z, f, y_end, POST_D))
        adds.append(slab(min(x, x + sx * 40), max(x, x + sx * 40), f + 0.5, y_end, z - r, z + r))
        adds.append(slab(x - r, x + r, f + 0.5, y_end, min(z, z + sz * 60), max(z, z + sz * 60)))
    back = U([shell, I(U(adds), outer)])
    cuts = [cyl_y(x, z, f - 1, f + 10, PILOT) for x, z in screw_xz()]
    # perforated grilles on both sides and on top
    for j in range(5):
        y = f + 12 + 7.5 * j
        hw0, h0 = hood_size(y)
        hw1, h1 = hood_size(y + 4.5)
        for s in (-1, 1):
            xa, xb = hw1 - WALL - 0.6, hw0 + 1.0
            for i in range(7):
                z = 30 + 8 * i
                cuts.append(slab(min(s * xa, s * xb), max(s * xa, s * xb), y, y + 4.5, z, z + 2.2))
        for i in range(17):
            x = -48 + 6 * i
            cuts.append(slab(x - 1.1, x + 1.1, y, y + 4.5, h1 - WALL - 0.6, h0 + 1.0))
    # "fan" on the back, and the notch for the charger's cable at the bottom
    yr = f + HOOD_D
    for r_, n_ in ((5.0, 8), (10.0, 14), (15.0, 20)):
        for k in range(n_):
            t = 2 * np.pi * k / n_
            cuts.append(cyl_y(-45 + r_ * cos(t), 52 + r_ * sin(t), yr - WALL - 1, yr + 1, 2.4, sections=12))
    nw, nh = REAR_NOTCH
    cuts.append(ext_xz(rrect(nw, 2 * nh, nw / 2 - 0.01, 0, 0), yr - WALL - 3, yr + 1))
    # the 2 screws down into the foot's neck (heads inside)
    yf = foot_screw_y()
    for s in (-1, 1):
        cuts.append(cyl(s * FOOT_SCREW_X, yf, -1, WALL + 1, CLEAR))
    return single(D(back, *cuts), "PixelPhoneBack")


# ------------------------------------------------------------------ foot (world frame)
def build_stand():
    c = STAND_CHAMFER
    R = STAND_D / 2
    yc = FOOT_Y
    puck = hull(cyl(0, yc, 0, STAND_H - c, 2 * R, sections=120), cyl(0, yc, STAND_H - c, STAND_H, 2 * (R - c), sections=120))
    neck = ext_xy(rrect(NECK_W, NECK_D, NECK_R, 0, yc), STAND_H - 0.5, 200)
    under = world(slab(-500, 500, -500, 500, -500, 0))             # everything under the CRT back's floor
    foot = U([puck, I(neck, under)])
    cuts = [ext_xy(ring(0, yc, 2 * R + 2, 2 * R - 1.6), 3.0, 4.0)]   # groove all around, like Pixel's foot
    yf = foot_screw_y()
    for s in (-1, 1):                                                # pilots for the 2 screws from inside the back
        cuts.append(world(cyl(s * FOOT_SCREW_X, yf, -14.0, 1.0, PILOT)))
    for a in (45, 135, 225, 315):                                    # rubber feet
        t = radians(a)
        cuts.append(cyl(0.68 * R * cos(t), yc + 0.68 * R * sin(t), -1, 1.0, 10.5))
    return single(D(foot, *cuts), "PixelPhoneStand")


# ------------------------------------------------------------------ print poses
def pose_matrix(m, kind):
    rot = {"upright": None, "face_down": (np.pi / 2, [1, 0, 0]), "back_down": (-np.pi / 2, [1, 0, 0])}[kind]
    R = trimesh.transformations.rotation_matrix(*rot) if rot else np.eye(4)
    mm = m.copy(); mm.apply_transform(R)
    return trimesh.transformations.translation_matrix([-mm.centroid[0], -mm.centroid[1], -mm.bounds[0][2]]) @ R


def pose(m, kind):
    mm = m.copy(); mm.apply_transform(pose_matrix(m, kind))
    return mm


def insert_name(phone_key=PHONE, case=NO_CASE):
    return f"PixelPhoneSupport_{phone_key}" + ("_Coque" if case["side"] > 0 else "")


def build_all():
    front, back, stand = build_front(), build_back(), build_stand()
    ins, lo = build_insert(PHONE, NO_CASE, insert_name())
    ins_c, lo_c = build_insert(PHONE, CASE, insert_name(PHONE, CASE))
    test, _ = build_phone_test(PHONE, NO_CASE, f"PhoneFitTest_{PHONE}")
    test_c, _ = build_phone_test(PHONE, CASE, f"PhoneFitTest_{PHONE}_Coque")
    ptest, _ = build_puck_test()
    assembled = dict(PixelPhoneFront=front, PixelPhoneBack=back, PixelPhoneStand=from_world(stand))
    inserts = {insert_name(): (ins, lo), insert_name(PHONE, CASE): (ins_c, lo_c)}
    printable = {
        "PixelPhoneFront": pose(front, "back_down"), "PixelPhoneBack": pose(back, "back_down"),
        "PixelPhoneStand": pose(stand, "upright"),
        insert_name(): pose(ins, "back_down"), insert_name(PHONE, CASE): pose(ins_c, "back_down"),
        f"PhoneFitTest_{PHONE}": pose(test, "back_down"), f"PhoneFitTest_{PHONE}_Coque": pose(test_c, "back_down"),
        "PuckFitTest": pose(ptest, "back_down"),
    }
    return assembled, inserts, printable


def main():
    OUT.mkdir(exist_ok=True)
    for old in OUT.glob("*.stl"):
        old.unlink()
    _, inserts, printable = build_all()
    for name, (_, lo) in inserts.items():
        u0, u1 = lo["puck_u"]
        print(f"  {name}: rim {lo['rim_x']:.2f} x {lo['rim_z']:.2f} mm, floor {lo['floor']:.1f} mm, "
              f"charger slot u {u0:.1f}..{u1:.1f} mm (coil at {lo['p']['coil_u']:.1f} [estimate])")
    total = 0.0
    for name, m in printable.items():
        m.export(OUT / f"{name}.stl")
        w, d, h = m.extents
        grams = filament_g(m)
        if "Test" not in name and "Coque" not in name:
            total += grams
        print(f"  {name:32s} {w:6.1f} x {d:6.1f} x {h:5.1f} mm   ~{grams:4.0f} g")
    print(f"  filament for the monitor + one insert (without the tests): ~{total:.0f} g")


if __name__ == "__main__":
    main()
