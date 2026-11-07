"""Pixel, retro edition: a beige 90s desktop PC that is really a Raspberry Pi 4.

- The "CRT monitor" holds a 7" touch screen (Freenove FNK0078H, 800x480 IPS, DSI).
- The "desktop case" holds the Raspberry Pi 4 and the wiring. Its front panel shows engraved fake buttons
  and LEDs (v1) or holds real ones (v2, see V2_PANEL).
- The "keyboard" is the inner module of a Stream Deck MK.2 in a printed retro keyboard.
- The screen takes its 5 V from the Pi through a printed "faux Pi" plate: no soldering anywhere.
No moving parts. One cable: the Pi's USB-C power.

Parts (stl/), each exported in its print orientation, no supports needed:
    PixelMonitorFront.stl        bezel that holds the screen (prints face-down)
    PixelMonitorBack.stl         tapered CRT back with vents and the 4 posts that hold the screen (prints back-down)
    PixelStand.stl               round swivel foot under the monitor (prints top-down)
    PixelCase.stl                desktop case shell (prints top-down)
    PixelCaseBottom.stl          bottom plate, the Pi is screwed on it (prints flat)
    PixelKeyboardBase.stl        retro keyboard that holds the Stream Deck MK.2's inner module (prints upright)
    PixelKeyboardTop.stl         beige keyboard top with the 15 key holes (prints top-down)
    PixelScreenPowerAdapter.stl  "faux Pi": plate screwed on the screen's standoffs instead of the Pi, holding a
                                 piece of pin header where the Pi's GPIO pins would be (prints flat)
    PixelStreamDeckTray.stl      option: low tray for a whole, unopened Stream Deck MK.2 (prints upright)
    ScreenFitTest.stl            thin frame to check the screen size before the big prints
    StreamDeckFitTest.stl        the keyboard top's key field on a short rim of the module pocket: press it on the
                                 bare Stream Deck module to check the 15 key windows before the keyboard (prints flat)
  v2 only (V2_PANEL = True):
    PixelKeyboardLeds.stl        translucent bar for the 3 keyboard LED windows (same position as the top:
                                 load both as one object in the slicer to print it in translucent filament)

    pip install trimesh manifold3d shapely mapbox_earcut numpy scipy matplotlib
    python3 generate.py            # then: python3 tools/verify.py

Coordinates: X = left/right, Y = front (0) to back, Z = up. Units: mm.
Values marked [measure] are estimates from Freenove's photos: check them on the real screen.
"""

from math import cos, radians, sin, tan
from pathlib import Path

import numpy as np
import trimesh
from shapely import affinity
from shapely.geometry import Point, Polygon, box
from shapely.ops import unary_union

OUT = Path(__file__).parent / "stl"

# ------------------------------------------------------------------ version
V2_PANEL = False     # False (v1): engraved fake buttons and LEDs, no wiring.
                     # True (v2): real buttons, LEDs and LED strip (holes, windows, translucent bar, strip pocket)

# ------------------------------------------------------------------ bought parts
SD_W, SD_H, SD_T = 118.0, 84.0, 25.0            # Stream Deck MK.2, stand removed
SD_ANGLE = 7.0                                  # keyboard-like tilt
SD_CLR = 0.75

# Freenove 7" touch screen FNK0078H (IPS, metal back). Freenove's packing list gives 19.3 x 11.1 cm for the
# glass; the metal back of the LCD, the driver board and its standoffs are measured on Freenove's photos.
# (The older blue-board FNK0078B/C is only about 165 x 100 mm: it would need other numbers here.)
SCR_W, SCR_H = 193.0, 111.0                     # cover glass [measure]
SCR_GLASS_T = 2.0                               # glass thickness at its black border [measure]
SCR_T = 7.5                                     # glass front -> metal back of the LCD: the posts press there [measure]
SCR_CLR = 0.75
LCD_W, LCD_H = 168.0, 102.0                     # grey metal back of the LCD [measure]
LCD_DX, LCD_DZ = 1.2, -2.1                      # its centre vs the glass centre, seen from the front [measure]
VIEW_DX, VIEW_DZ = 0.0, 0.0                     # picture centre vs glass centre, seen from the front [measure]
WIN_W, WIN_H, WIN_R = 160.0, 94.0, 2.0          # window: shows the whole picture even if it is 3 mm off-centre
ACTIVE_W, ACTIVE_H = 154.2, 85.9                # picture size (previews and checks)
SCR_TABS = [(-62.8, 34.3), (65.9, 34.3), (-62.8, -33.4), (65.9, -33.4)]   # stamped tabs with M3 nuts for the
SCR_TAB = (15.0, 9.0, 3.0)                      # screen's legs (X, Z from the glass centre; size W, H, height)
# The Freenove driver board on the metal back has the Pi 4 hole pattern on 4 brass standoffs; two spring contacts
# press on the underside of the Pi's GPIO header to take 5 V and GND (pins 4 and 6 on Freenove's photos).
PI_ON_SCR = (-4.7, -7.0)                        # centre of the 58 x 49 hole pattern vs the glass centre, seen from
PI_ON_SCR_ROT = 0.0                             # the front [measure]; rotation in degrees, 0 = USB end to the right
                                                # and GPIO header at the bottom (seen from the front)
DRV_Z0, DRV_T = 3.5, 1.6                        # driver board: underside above the metal back, thickness [measure]
STANDOFF_H, STANDOFF_D = 6.0, 5.0               # brass standoffs between the driver board and the Pi [measure]
POGO_PINS = (4, 6)                              # GPIO pins the spring contacts touch: 5 V, then GND [check]

PI_L, PI_W = 85.0, 56.0                         # Raspberry Pi 4 board
PI_HOLES = [(3.5, 3.5), (61.5, 3.5), (3.5, 52.5), (61.5, 52.5)]
PI_HOLE_CENTRE = (32.5, 28.0)
# GPIO header, from the official Raspberry Pi 4 Model B mechanical drawing (datasheets.raspberrypi.com,
# RP-008343-DS-1): 2 x 20 pins at 2.54 mm, centred 29 mm right of the hole at x = 3.5 and on the line of the
# holes at y = 52.5. Pins 1-2 are at the SD-card end; even pins are on the board-edge row.
GPIO_X1 = 3.5 + 29.0 - 9.5 * 2.54               # x of pins 1 and 2
GPIO_Y = 52.5
PI_STANDOFF = 5.0
SPK_D, SPK_H = 40.0, 18.0                       # v2: 40 mm speaker
# front-panel parts: engraved fakes in v1, real parts held by their own nuts in v2 (centres: X, Z)
PWR_XZ, PWR_HOLE = (76.0, 51.0), 16.2           # 16 mm momentary metal button with LED ring
TURBO_XZ, TURBO_HOLE = (56.0, 51.0), 12.2       # 12 mm momentary button, the "Turbo" of old PCs
LED3_X, LED3_Z, LED3_HOLE = (24.0, 32.0), 51.0, 5.0   # two 3 mm LEDs in chrome holders: power, activity
LED5_XZ, LED5_HOLE = (42.0, 51.0), 8.0          # 5 mm addressable RGB LED in a chrome holder: notifications

# faux Pi (PixelScreenPowerAdapter): standard 2.54 mm double-row male header, cut by hand to 2 x 5 pins
HDR_PINS = 10                                   # pins 1..10
HDR_BODY_H = 2.5                                # plastic body height
HDR_TAIL = 3.0                                  # short ends below the body [measure your header]
HDR_LONG = 6.0                                  # long ends above the body
PIN_BELOW = 1.6                                 # short ends stick out under the plate like a soldered Pi header
HDR_SLOT_W = 5.1                                # press fit for the 5.08 mm wide body (prints a bit narrower)
HDR_SLOT_CLR = 0.2                              # extra length at each end: the cut ends are rough
HDR_HOLE = 1.2                                  # holes for the 0.64 mm square short ends
ADP_T = HDR_TAIL - PIN_BELOW + HDR_BODY_H       # plate thickness: the body sits flush with the top. Fixed with
                                                # 4 x M2.5 x 6 (the M2.5 x 4 that come with the screen are too short)
DUPONT = (2.6, 14.0)                            # female Dupont housing: section, length

# ------------------------------------------------------------------ layout
WALL = 2.4
PILOT, CLEAR = 2.2, 2.8                         # M2.5 self-tapping pilot / clearance
CBORE_D, CBORE_H = 5.0, 1.2                     # screw-head pockets under the bottom plate (1.2 mm of plate stays)
OVER = 0.01

# keyboard tray (front)
TRAY_HW, TRAY_D, TRAY_R = 68.0, 94.0, 6.0
TRAY_Z_FRONT = 9.5                              # room under the deck for a 90 deg USB-C plug
POCKET_DEPTH = 5.0
POCKET_S0 = 4.5                                 # front rim, measured along the slope

# desktop case
CASE_HW, CASE_Y0, CASE_D, CASE_H = 105.0, 94.5, 160.0, 64.0     # a bit wider than the monitor
CASE_Y1 = CASE_Y0 + CASE_D
CASE_R, CASE_CHAMFER = 4.0, 2.0
PLATE_T = 2.4
PI_X0 = CASE_HW - 17.0                          # X of the Pi's SD-card edge (board rotated 180 deg)
PI_Y0 = CASE_Y1 - WALL - 2.2                    # Y of the Pi's USB-C edge (audio jack clears the wall)
SPK_XY = (-72.0, CASE_Y1 - 32.0)                # back left
TRAY_SCREWS_X = 45.0
SD_CABLE_X = -33.8                              # X of the Stream Deck's USB-C port (and of the cable tunnel)

# retro keyboard around the Stream Deck MK.2's inner module
# (module dimensions: github.com/stagehacks/Stream-Deck-Module, drawing at 1:1)
KB_ANGLE = 10.0
KB_W, KB_D, KB_R = 136.0, 94.0, 6.0
KB_Z_FRONT = 17.5                               # room under the module for a 90 deg USB-C plug
KB_TOP_T = 2.0
MOD_W, MOD_H, MOD_T = 107.0, 70.0, 9.0          # module body (buttons stick out 3 mm in front)
MOD_KEY_X = [14.975 + 19.26 * i for i in range(5)]  # key centres from the module's left edge
MOD_KEY_Y = [19.195, 38.465, 57.725]                # key centres from the module's top edge
KEY_CUT, KEY_R = 17.0, 3.5                       # Elgato faceplate cutout
MOD_CONN = (19.7, 19.9)                          # USB-C on the back, from the top-left corner
MOD_CONN_DEPTH = 8.9                             # how far the connector sticks out behind the body
MOD_V0 = 16.0                                    # module's front edge, along the slope
MOD_CLR, MOD_LEDGE = 0.25, 2.5                   # the module rests on its outer 2.5 mm only
MOD_DEPTH = MOD_T + 0.3                          # pocket depth down to the ledge (+ a 0.5 mm foam strip on the ledge
                                                 # clamps the module)
SDTEST_RIM = 2.0                                 # StreamDeckFitTest: wall around the module pocket
KB_TOP_SCREWS = [(-62.0, 8.0), (62.0, 8.0), (-62.0, 85.0), (62.0, 85.0)]   # the rear ones keep 1.9 mm of back wall
TRAY_SCREW_Z = 8.0
# three status LEDs in the keyboard: engraved marks in v1; in v2 a 3-LED piece of WS2812B strip (144 LEDs/m, 5 V)
# under three windows filled by a small bar printed in translucent filament
KB_LED_PITCH = 1000.0 / 144                     # LED spacing on a 144 LEDs/m strip
KB_LED_U = [38.0 + KB_LED_PITCH * k for k in range(3)]
KB_LED_V = 8.0
KB_LED_WIN = (4.6, 2.0)                         # window in the top plate
KB_LED_BAR = (2 * KB_LED_PITCH + 8.6, 5.0)      # translucent bar under the plate, its bumps fill the windows
KB_LED_BAR_T = 0.8

# stand (swivel foot)
STAND_R, STAND_H, STAND_CHAMFER = 36.0, 10.0, 3.0
STAND_Y = 160.0                                 # under the monitor's centre of mass
STAND_CASE_SCREWS = [(0, 24.0), (0, -24.0), (26.0, 0), (-26.0, 0)]   # relative to the stand centre
STAND_MON_SCREWS = [(-18.0, -9.0), (18.0, -9.0), (-18.0, 9.0), (18.0, 9.0)]
RIBBON_SLOT = (-10.0, 10.0, STAND_Y - 2.0, STAND_Y + 9.0)   # X0, X1, Y0, Y1: screen ribbon + 2 power wires

# monitor: everything follows the screen size
MON_F = CASE_Y0 + 14.0                          # front face of the bezel
MON_Z0 = CASE_H + STAND_H                       # bottom of the monitor
SCR_BOTTOM = 18.0                               # glass bottom above the monitor's bottom (the "chin")
BEZ_WALL, BEZ_TOP = 5.25, 9.0                   # bezel around the glass pocket: sides, top
BEZ_D, BEZ_R, BEZ_CHAMFER = 22.0, 7.0, 1.5
BEZ_W = SCR_W + 2 * SCR_CLR + 2 * BEZ_WALL
BEZ_H = SCR_BOTTOM + SCR_H + SCR_CLR + BEZ_TOP
FUNNEL = 5.0                                    # sunken screen: 45 deg funnel depth
BACK_STEP = 2.0                                 # the CRT back is this much smaller than the bezel (sides, top)
BACK_TAPER_W, BACK_TAPER_H = 34.0, 24.0         # its rear end is this much narrower / lower than its front
BACK_FRONT_W, BACK_FRONT_H = BEZ_W - 2 * BACK_STEP, BEZ_H - 2 * BACK_STEP
BACK_W, BACK_H, BACK_D, BACK_R = BACK_FRONT_W - BACK_TAPER_W, BACK_FRONT_H - BACK_TAPER_H, 120.0, 8.0
TONGUE_X = 60.0                                 # the back hooks into the bezel with two tongues at the top
POST_X, POST_DZ, POST_D = 74.0, 14.0, 8.0       # four posts press the LCD's metal back forward (from the glass
FOAM_T = 1.0                                    # centre); 1 mm foam pads on their tips


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
    for ring_ in tp.to_polygons():
        if len(ring_) >= 3:
            geom = geom.symmetric_difference(Polygon(ring_).buffer(0))
    return affinity.translate(geom, x, y)


def text_centred(txt, size, x, y, angle=0.0):
    """Bold text centred on (x, y), turned by angle (degrees, counter-clockwise)."""
    g = text_poly(txt, size, 0, 0)
    x0, y0, x1, y1 = g.bounds
    g = affinity.translate(g, -(x0 + x1) / 2, -(y0 + y1) / 2)
    return affinity.translate(affinity.rotate(g, angle, origin=(0, 0)), x, y)


def ring(cx, cy, d_out, d_in):
    return Point(cx, cy).buffer(d_out / 2, quad_segs=24).difference(Point(cx, cy).buffer(d_in / 2, quad_segs=24))


def disc(cx, cy, d):
    return Point(cx, cy).buffer(d / 2, quad_segs=24)


def parts_of(geom):
    return [g for g in getattr(geom, "geoms", [geom]) if g.area > 0.01]


def engrave_front(poly_xz, y_face, depth):
    """Engrave a shape drawn in (X, Z) into a face that looks towards -Y at y = y_face."""
    return U([ext_xz(g, y_face - 1.0, y_face + depth) for g in parts_of(poly_xz)])


def engrave_top(poly_xy, z_top, depth):
    """Engrave a shape drawn in (X, Y) into a face that looks up at z = z_top."""
    return [ext_xy(g, z_top - depth, z_top + 1.0) for g in parts_of(poly_xy)]


def filament_g(m, walls=3, line=0.42, infill=0.15, density=1.24):
    """Slicer-like estimate: 3 perimeters (and top/bottom skins) of 0.42 mm on the whole surface,
    15 % infill inside. PLA, grams."""
    v = abs(m.volume)
    shell = min(v, m.area * walls * line)
    return (shell + infill * (v - shell)) * density / 1000.0


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
    cuts.append(slab(SD_CABLE_X - 14, SD_CABLE_X + 14, 48, top(dp["s1"])[0] - 1.0, 1.6, 40))
    cuts.append(slab(SD_CABLE_X - 7, SD_CABLE_X + 7, 70, TRAY_D + 1, 3.0, 13.0))
    # pilots for the two screws coming from inside the case
    for s in (-1, 1):
        cuts.append(cyl_y(s * TRAY_SCREWS_X, TRAY_SCREW_Z, TRAY_D - 12, TRAY_D + 1, PILOT))
    # rubber feet
    for x, y in ((-52, 14), (52, 14), (-52, 80), (52, 80)):
        cuts.append(cyl(x, y, -1, 1.0, 10.5))
    return single(D(tray, *cuts), "PixelStreamDeckTray")


# ------------------------------------------------------------------ retro keyboard (Stream Deck module inside)
def kb_frame():
    """Local keyboard frame -> world: u = X, v up the slope from the front edge, w out of the top surface."""
    a = radians(KB_ANGLE)
    return np.array([[1, 0, 0, 0], [0, cos(a), -sin(a), 0], [0, sin(a), cos(a), KB_Z_FRONT], [0, 0, 0, 1]], float)


def kb_local(mesh):
    m = mesh.copy(); m.apply_transform(kb_frame()); return m


def kb_box(u0, u1, v0, v1, w0, w1):
    return kb_local(slab(u0, u1, v0, v1, w0, w1))


def kb_world(u, v, w):
    return (kb_frame() @ np.array([u, v, w, 1.0]))[:3]


def module_uv(x, y):
    """Module front-view coordinates (x from the left edge, y from the top edge) -> keyboard (u, v)."""
    return x - MOD_W / 2, MOD_V0 + MOD_H - y


def mod_pocket():
    """Module pocket in the keyboard base, (u0, u1, v0, v1): the module with MOD_CLR all around."""
    hw, c = MOD_W / 2 + MOD_CLR, MOD_CLR
    return -hw, hw, MOD_V0 - c, MOD_V0 + MOD_H + c


def kb_key_windows():
    """The 15 key windows of the keyboard top, (u, v) outlines."""
    return [rrect(KEY_CUT, KEY_CUT, KEY_R, *module_uv(x, y)) for x in MOD_KEY_X for y in MOD_KEY_Y]


def kb_top_outline():
    a = radians(KB_ANGLE)
    return rrect(KB_W, KB_D / cos(a), KB_R, 0, KB_D / cos(a) / 2)


def kb_screw_axis(u, v):
    """Screw from below the base up into the top plate, perpendicular to the plate."""
    p0 = kb_world(u, v, 0.0)
    n = kb_world(u, v, 1.0) - p0
    t = -p0[2] / n[2]                              # where the axis meets the desk (z = 0)
    return p0, n, p0 + t * n


def cyl_axis(p_from, p_to, d, sections=32):
    return trimesh.creation.cylinder(radius=d / 2, segment=[p_from, p_to], sections=sections)


def build_keyboard():
    a = radians(KB_ANGLE)
    z_back = KB_Z_FRONT + KB_D * tan(a)
    prof = Polygon([(0, 0), (0, KB_Z_FRONT), (KB_D, z_back), (KB_D, 0)])
    base = I(ext_xy(rrect(KB_W, KB_D, KB_R, 0, KB_D / 2), 0, 60), ext_yz(prof, -200, 200))
    hw, depth = MOD_W / 2 + MOD_CLR, MOD_DEPTH
    cuts = [kb_box(*mod_pocket(), -depth, 5),                                                   # module body
            kb_box(-hw + MOD_LEDGE, hw - MOD_LEDGE, MOD_V0 + MOD_LEDGE, MOD_V0 + MOD_H - MOD_LEDGE, -depth - 3.0, 1)]
    cu, cv = module_uv(*MOD_CONN)
    plug_pocket = kb_box(cu - 11, cu + 11, cv - 11, cv + 11, -40, 1)                           # USB-C + 90 deg plug
    cuts.append(I(plug_pocket, slab(-200, 200, -10, 200, 1.6, 100)))
    pocket_y = kb_world(cu, cv - 11, 0)[1]
    cuts.append(slab(SD_CABLE_X - 7, SD_CABLE_X + 7, pocket_y, KB_D + 1, 3.0, 13.0))           # cable tunnel to the case
    for s_ in (-1, 1):
        cuts.append(cyl_y(s_ * TRAY_SCREWS_X, TRAY_SCREW_Z, KB_D - 12, KB_D + 1, PILOT))
    for u, v in KB_TOP_SCREWS:                                                                    # top-plate screws
        p0, n, pb = kb_screw_axis(u, v)
        cuts.append(kb_local(cyl(u, v, -6.2, 0.5, 7.6)))                                         # boss pocket
        cuts.append(cyl_axis(pb - 1.0 * n, p0, CLEAR))
        cuts.append(cyl_axis(pb - 1.0 * n, kb_world(u, v, -10.0), CBORE_D + 0.4))              # well: an M2.5x10 reaches the boss
    for x, y in ((-52, 10), (52, 10), (-52, 82), (52, 82)):
        cuts.append(cyl(x, y, -1, 1.0, 10.5))
    if V2_PANEL:
        # LED strip pocket under the windows, and a tunnel for its 3 wires into the cavity under the module
        # (from there they follow the Stream Deck cable through the tunnel into the case)
        u0, u1 = KB_LED_U[0] - 4.5, KB_LED_U[-1] + 4.5
        cuts.append(kb_box(u0, u1, KB_LED_V - 6.25, KB_LED_V + 6.25, -3.5, 1))
        cuts.append(kb_box(u0, u0 + 5.0, KB_LED_V + 2.0, MOD_V0 + MOD_LEDGE + 2.0, -depth - 3.0, -2.0))
    base = single(D(base, *cuts), "PixelKeyboardBase")

    # top plate, built in the local frame (w = 0 is its underside)
    top = ext_xy(kb_top_outline(), 0, KB_TOP_T)
    adds = [cyl(u, v, -6.0, OVER, 7.0) for u, v in KB_TOP_SCREWS]
    top = U([top, *adds])
    tcuts = []
    tcuts += [ext_xy(w, -1, KB_TOP_T + 1) for w in kb_key_windows()]
    for u, v in KB_TOP_SCREWS:                                    # blind: 1.2 mm of top stays over the screw tip
        tcuts.append(cyl(u, v, -6.5, KB_TOP_T - 1.2, PILOT))
    # engraved on the top face: key-field frame, PIXEL badge (+ the three LED marks in v1)
    fu, fv = module_uv(MOD_W / 2, MOD_H / 2)
    frame = rrect(MOD_W + 4, MOD_H - 7, 3.0, 0, fv + 2.2).difference(rrect(MOD_W + 2.6, MOD_H - 8.4, 2.4, 0, fv + 2.2))
    marks = [frame, text_poly("PIXEL", 6.0, -58.0, 5.0)]
    mid = (KB_LED_U[0] + KB_LED_U[-1]) / 2
    if V2_PANEL:
        for u in KB_LED_U:                                                                      # LED windows
            tcuts.append(ext_xy(rrect(*KB_LED_WIN, 0.6, u, KB_LED_V), -1, KB_TOP_T + 1))
        tcuts.append(ext_xy(rrect(*KB_LED_BAR, 0.8, mid, KB_LED_V), -1, KB_LED_BAR_T))        # recess for the bar
    else:
        marks += [rrect(*KB_LED_WIN, 0.6, u, KB_LED_V) for u in KB_LED_U]                       # fake LEDs
    for mk in marks:
        tcuts += engrave_top(mk, KB_TOP_T, 0.6)
    top_local = single(D(top, *tcuts), "PixelKeyboardTop")
    leds_local = None
    if V2_PANEL:
        bw, bh = KB_LED_BAR
        bar = U([ext_xy(rrect(bw - 0.2, bh - 0.2, 0.7, mid, KB_LED_V), 0, KB_LED_BAR_T - 0.05)] +
                [ext_xy(rrect(KB_LED_WIN[0] - 0.2, KB_LED_WIN[1] - 0.2, 0.5, u, KB_LED_V), KB_LED_BAR_T - 0.1, KB_TOP_T) for u in KB_LED_U])
        leds_local = single(bar, "PixelKeyboardLeds")
    return base, kb_local(top_local), top_local, (kb_local(leds_local) if leds_local is not None else None), leds_local


# ------------------------------------------------------------------ desktop case
def pi_xy(hx, hy):
    """Pi board coordinates (x from the SD-card edge, y from the USB-C edge) -> case X, Y."""
    return PI_X0 - hx, PI_Y0 - hy


def case_inner_box():
    return (-CASE_HW + WALL, CASE_HW - WALL, CASE_Y0 + WALL, CASE_Y1 - WALL)


def plate_screws():
    x0, x1, y0, y1 = case_inner_box()
    return [(x0 + 6.6, y0 + 6.6), (x1 - 6.6, y0 + 6.6), (x0 + 6.6, y1 - 6.6), (x1 - 6.6, y1 - 6.6)]


def case_feet():
    """Rubber feet under the bottom plate, next to its screws (clear of the screw heads, the Pi and the edge)."""
    return [(x - np.sign(x) * 1.5, y + (-10.0 if y > CASE_Y0 + CASE_D / 2 else 10.0)) for x, y in plate_screws()]


def front_panel_holes():
    return [(PWR_XZ, PWR_HOLE), (TURBO_XZ, TURBO_HOLE), (LED5_XZ, LED5_HOLE)] + [((x, LED3_Z), LED3_HOLE) for x in LED3_X]


def front_panel_fakes():
    """v1: engraved fakes of the v2 front-panel parts, at the same places."""
    (px, pz), (tx, tz), (lx, lz) = PWR_XZ, TURBO_XZ, LED5_XZ
    marks = [ring(px, pz, PWR_HOLE + 2.6, PWR_HOLE + 1.0), disc(px, pz, 9.0),            # power button: ring + centre
             ring(tx, tz, TURBO_HOLE + 2.4, TURBO_HOLE + 0.8), disc(tx, tz, 6.0),        # Turbo button
             ring(lx, lz, LED5_HOLE + 1.6, LED5_HOLE), disc(lx, lz, 3.2)]                 # notification LED
    marks += [ring(x, LED3_Z, LED3_HOLE + 1.4, LED3_HOLE - 0.2) for x in LED3_X]          # power and activity LEDs
    marks += [disc(x, LED3_Z, 2.0) for x in LED3_X]
    return marks


def teardrop(x, z, d):
    """Round hole with a small point at the bottom: the case prints upside down, so the point is the
    top of the hole on the printer and needs no support. The part's own flange hides it."""
    r = d / 2
    c = Point(x, z).buffer(r, quad_segs=24)
    return c.union(Polygon([(x - r * 0.7071, z - r * 0.7071), (x, z - r * 1.4142), (x + r * 0.7071, z - r * 0.7071)]))


def ribbon_slot(z0, z1):
    x0, x1, y0, y1 = RIBBON_SLOT
    return slab(x0, x1, y0, y1, z0, z1)


def build_case():
    c = CASE_CHAMFER
    core = ext_xy(rrect(2 * CASE_HW - 2 * c, CASE_D - 2 * c, CASE_R - c, 0, CASE_Y0 + CASE_D / 2), 0, CASE_H - c)
    shell = chamfer_top(core, c)
    x0, x1, y0, y1 = case_inner_box()
    shell = D(shell, slab(x0, x1, y0, y1, -1, CASE_H - WALL))
    adds = []
    for x, y in plate_screws():                                      # bottom plate screws
        adds.append(cyl(x, y, PLATE_T, CASE_H - WALL + OVER, 8.0))
    sx, sy = SPK_XY                                                  # speaker ring (v2 speaker)
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
    cuts.append(ribbon_slot(CASE_H - WALL - 1, CASE_H + 1))
    # speaker slots in the top
    for k in range(6):
        y = sy - 13 + 5.2 * k
        cuts.append(slab(sx - 15, sx + 15, y, y + 2.2, CASE_H - WALL - 1, CASE_H + 1))
    # tray screws + Stream Deck cable through the front wall
    for s in (-1, 1):
        cuts.append(cyl_y(s * TRAY_SCREWS_X, TRAY_SCREW_Z, CASE_Y0 - 1, y0 + 4, CLEAR))
    cuts.append(slab(SD_CABLE_X - 7, SD_CABLE_X + 7, CASE_Y0 - 1, y0 + 1, 3.0, 13.0))
    # Pi USB-C power through the back wall
    ux, _ = pi_xy(11.2, 0)
    uz = PLATE_T + PI_STANDOFF + 1.4 + 1.6
    cuts.append(slab(ux - 6.8, ux + 6.8, y1 - 1, CASE_Y1 + 1, uz - 4.2, uz + 4.2))
    # "power supply fan" on the back: a circle of small holes
    for r_, n_ in ((5.0, 8), (10.0, 14), (15.0, 20)):
        for k in range(n_):
            t = 2 * np.pi * k / n_
            cuts.append(cyl_y(-45 + r_ * cos(t), 32 + r_ * sin(t), y1 - 1, CASE_Y1 + 1, 2.4, sections=12))
    # side vents
    for s in (-1, 1):
        for k in range(11):
            y = CASE_Y1 - 75 + 6 * k
            cuts.append(slab(min(s * (CASE_HW + 1), s * (CASE_HW - WALL - 1)), max(s * (CASE_HW + 1), s * (CASE_HW - WALL - 1)),
                             y, y + 2.0, 14, 48))
    # front panel: engraved CD-ROM and floppy bays; buttons and LEDs engraved (v1) or real holes (v2)
    yf = CASE_Y0
    det = [
        rrect(64, 14, 1.0, -60, 52.0).difference(rrect(62.4, 12.4, 0.6, -60, 52.0)),   # 5.25" bay outline
        rrect(56, 0.8, 0.2, -60, 51.4), rrect(7, 2.4, 0.5, -34, 47.8),                  # tray line, eject
        rrect(40, 9, 1.0, -2, 51.0).difference(rrect(38.4, 7.4, 0.6, -2, 51.0)),        # 3.5" bay outline
        rrect(28, 1.6, 0.6, -5, 51.6), rrect(4, 2, 0.5, 13, 48.6),                      # floppy slot, button
    ]
    if not V2_PANEL:
        det += front_panel_fakes()
    for p in det:
        cuts.append(engrave_front(p, yf, 0.8))
    if V2_PANEL:
        for (hx, hz), d in front_panel_holes():
            cuts.append(ext_xz(teardrop(hx, hz, d), CASE_Y0 - 1, y0 + 1))
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
    for k in range(6):                                               # vents under the Pi, between its standoffs
        y = PI_Y0 - 46 + 7 * k
        cuts.append(slab(PI_X0 - 82, PI_X0 - 17, y, y + 3.0, -1, PLATE_T + 1))
    for x, y in case_feet():                                         # rubber feet next to the screws
        cuts.append(cyl(x, y, -1, 1.0, 10.5))
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
    cuts.append(ribbon_slot(z0 - 1, z1 + 1))
    return single(D(stand, *cuts), "PixelStand")


# ------------------------------------------------------------------ screen stack and faux Pi
def screen_box():
    """Centre of the glass (X, Z)."""
    return 0.0, MON_Z0 + SCR_BOTTOM + SCR_H / 2


def view_centre():
    cx, cz = screen_box()
    return cx + VIEW_DX, cz + VIEW_DZ


def y_glass():
    return MON_F + FUNNEL                          # front face of the glass


def y_lcd_back():
    return y_glass() + SCR_T                       # metal back of the LCD


def y_pi():
    return y_lcd_back() + DRV_Z0 + DRV_T + STANDOFF_H   # top of the standoffs = underside of the (faux) Pi


def pi_frame():
    """Pi-board coordinates on the screen's back -> world. x from the SD-card edge, y from the USB-C edge (as on
    the Raspberry Pi drawing), w = height above the underside of the Pi, towards the back of the monitor."""
    a = radians(PI_ON_SCR_ROT)
    c, s = cos(a), sin(a)
    cx, cz = screen_box()
    px, pz = cx + PI_ON_SCR[0], cz + PI_ON_SCR[1]
    hx, hy = PI_HOLE_CENTRE
    return np.array([[c, s, 0, px - c * hx - s * hy],
                     [0, 0, 1, y_pi()],
                     [s, -c, 0, pz - s * hx + c * hy],
                     [0, 0, 0, 1]], float)


def pi_local(mesh):
    m = mesh.copy(); m.apply_transform(pi_frame()); return m


def pi_world(x, y, w=0.0):
    return (pi_frame() @ np.array([x, y, w, 1.0]))[:3]


def gpio_xy(pin):
    """Centre of a GPIO pin (1..40) in Pi-board coordinates."""
    col = (pin - 1) // 2
    return GPIO_X1 + 2.54 * col, GPIO_Y + (1.27 if pin % 2 == 0 else -1.27)


def header_box():
    """Plastic body of the 2 x 5 header in Pi-board coordinates: x0, x1, y0, y1."""
    xs = [gpio_xy(p)[0] for p in range(1, HDR_PINS + 1)]
    return min(xs) - 1.27, max(xs) + 1.27, GPIO_Y - 2.54, GPIO_Y + 2.54


def adapter_outline():
    """Faux Pi plate: a HAT-size frame with the Pi 4 holes, and an island for the header and its labels."""
    hx0, hx1, hy0, hy1 = header_box()
    plate = rrect(65.0, PI_W, 3.0, 32.5, PI_W / 2).difference(rrect(45.0, 34.0, 3.0, 32.5, 27.0))
    y_end = PI_W + 9.5
    island = rrect(hx1 - hx0 + 6.5, y_end - (hy0 - 4.0), 1.5, (hx0 + hx1) / 2 + 0.3, (hy0 - 4.0 + y_end) / 2)
    return unary_union([plate, island])


def adapter_tie_slots():
    """Two slots under the header for a small cable tie that holds the two wires (strain relief)."""
    xs = [gpio_xy(p)[0] for p in POGO_PINS]
    return [(min(xs) - 2.9, PI_W + 6.2), (max(xs) + 2.9, PI_W + 6.2)]


def adapter_labels():
    """'1' next to pin 1, '5V' and 'GND' next to the pins the spring contacts touch. They read upright when you
    look at the back of the screen with its top edge up (Pi-board x points left there, y points down)."""
    x1_, y1_ = gpio_xy(1)
    labels = [text_centred("1", 2.6, x1_, header_box()[2] - 1.9, 180.0)]
    for pin, txt in zip(POGO_PINS, ("5V", "GND")):
        x, y = gpio_xy(pin)
        if pin % 2 == 0:                                            # board-edge row: label further out
            g = text_centred(txt, 2.3, x, 0, 90.0)
            gy0, gy1 = g.bounds[1], g.bounds[3]
            labels.append(affinity.translate(g, 0, header_box()[3] + 0.8 - gy0))
        else:                                                       # inner row: label further in
            g = text_centred(txt, 2.3, x, 0, 90.0)
            labels.append(affinity.translate(g, 0, header_box()[2] - 0.8 - g.bounds[3]))
    return labels


def build_adapter():
    """'Faux Pi' (PixelScreenPowerAdapter): screws on the screen's standoffs instead of the Pi and holds a 2 x 5
    piece of male pin header exactly where the Pi's GPIO pins 1-10 are. The screen's spring contacts press on the
    short ends, like on a soldered Pi header; female Dupont wires plug on the long ends.
    Built in Pi-board coordinates; w = 0 is the side facing the screen, which prints on the bed."""
    t, ledge = ADP_T, HDR_TAIL - PIN_BELOW
    plate = ext_xy(adapter_outline(), 0, t)
    cuts = []
    for hx, hy in PI_HOLES:                                       # 4 x M2.5 x 6 into the screen's standoffs
        cuts.append(cyl(hx, hy, -1, t + 1, CLEAR))
    x0, x1, y0, y1 = header_box()                                 # press-fit pocket for the plastic body
    cuts.append(ext_xy(rrect(x1 - x0 + 2 * HDR_SLOT_CLR, HDR_SLOT_W, 0.3, (x0 + x1) / 2, (y0 + y1) / 2), ledge, t + 1))
    for pin in range(1, HDR_PINS + 1):                            # the short ends go through the ledge
        cuts.append(cyl(*gpio_xy(pin), -1, ledge + 0.05, HDR_HOLE, sections=16))
    for lb in adapter_labels():
        cuts += engrave_top(lb, t, 0.5)
    for x, y in adapter_tie_slots():
        cuts.append(ext_xy(rrect(1.6, 3.2, 0.6, x, y), -1, t + 1))
    return single(D(plate, *cuts), "PixelScreenPowerAdapter")


# ------------------------------------------------------------------ monitor
def monitor_back_solid(inset=0.0, open_front=False):
    f, z0 = MON_F + BEZ_D, MON_Z0
    def sl(w, h, y0, y1):
        return ext_xz(rrect(w - 2 * inset, h - 2 * inset, max(1.0, BACK_R - inset), 0, z0 + h / 2), y0, y1)
    y_front = f - (1.0 if open_front else 0.0)
    return hull(sl(BACK_FRONT_W, BACK_FRONT_H, y_front, y_front + 0.01),
                sl(BACK_W, BACK_H, f + BACK_D - inset - 0.01, f + BACK_D - inset))


def back_size(y):
    """Outer half-width and height of the CRT back at depth y (it tapers linearly)."""
    t = min(max((y - (MON_F + BEZ_D)) / BACK_D, 0.0), 1.0)
    return (BACK_FRONT_W + (BACK_W - BACK_FRONT_W) * t) / 2, BACK_FRONT_H + (BACK_H - BACK_FRONT_H) * t


def post_positions():
    cx, cz = screen_box()
    return [(cx + sx * POST_X, cz + sz * POST_DZ) for sx in (-1, 1) for sz in (-1, 1)]


def tongue_z():
    return MON_Z0 + BACK_FRONT_H - 2.2


def build_monitor():
    f, z0 = MON_F, MON_Z0
    cx, cz = screen_box()
    vx, vz = view_centre()
    # ---------- bezel (solid, printed face-down)
    front = hull(ext_xz(rrect(BEZ_W - 2 * BEZ_CHAMFER, BEZ_H - 2 * BEZ_CHAMFER, BEZ_R - BEZ_CHAMFER, 0, z0 + BEZ_H / 2), f, f + 0.01),
                 ext_xz(rrect(BEZ_W, BEZ_H, BEZ_R, 0, z0 + BEZ_H / 2), f + BEZ_CHAMFER, f + BEZ_D))
    sw, sh = SCR_W + 2 * SCR_CLR, SCR_H + 2 * SCR_CLR
    cuts = [ext_xz(rrect(sw, sh, 0.5, cx, cz), f + FUNNEL, f + BEZ_D + 1)]                      # glass pocket
    funnel = hull(ext_xz(rrect(WIN_W, WIN_H, WIN_R, vx, vz), f + FUNNEL, f + FUNNEL + 0.5),
                  ext_xz(rrect(WIN_W + 2 * FUNNEL, WIN_H + 2 * FUNNEL, WIN_R + FUNNEL * 0.5, vx, vz), f - 0.01, f + 0.01))
    cuts.append(funnel)
    # tongue slots for the back, pilots for the stand screws
    zt = tongue_z()
    for s in (-1, 1):
        cuts.append(slab(s * TONGUE_X - 5.2, s * TONGUE_X + 5.2, f + BEZ_D - 6.5, f + BEZ_D + 0.5, zt, zt + 2.0))
    for dx, dy in STAND_MON_SCREWS:
        if STAND_Y + dy < f + BEZ_D:
            cuts.append(cyl(dx, STAND_Y + dy, z0 - 1, z0 + 12, PILOT))
    # engraved controls under the screen: badge, knobs, LED, power button
    zc = z0 + 9.0
    det = [text_poly("PIXEL", 7.0, -86.0, zc - 3.3), ring(46, zc, 4.6, 3.0), ring(54, zc, 4.6, 3.0), ring(62, zc, 4.6, 3.0),
           rrect(5.0, 1.8, 0.6, 71.5, zc), ring(83, zc, 9.0, 7.0), Point(83, zc).buffer(1.0, quad_segs=12)]
    for p in det:
        cuts.append(engrave_front(p, f, 0.7))
    bezel = single(D(front, *cuts), "PixelMonitorFront")

    # ---------- tapered CRT back (shell, printed back-down)
    back = D(monitor_back_solid(), monitor_back_solid(WALL, open_front=True))
    adds = []
    # posts pressing the LCD's metal back forward (with 1 mm foam pads), clear of the faux Pi and its wires
    y_press = y_lcd_back() + FOAM_T
    for px, pz in post_positions():
        adds.append(cyl_y(px, pz, y_press, f + BEZ_D + BACK_D - WALL + OVER, POST_D))
    # bottom block for the stand screws
    # (ends in a 45 deg ramp so it prints without support)
    yb0, yb1 = STAND_Y - 16.0, STAND_Y + 16.0
    adds.append(hull(slab(-26, 26, yb0, yb1, z0 + 0.5, z0 + 10), slab(-26, 26, yb1, yb1 + 9.5, z0 + 0.5, z0 + 1.0)))
    # tongues reaching into the bezel
    for s in (-1, 1):
        adds.append(slab(s * TONGUE_X - 4.8, s * TONGUE_X + 4.8, f + BEZ_D - 6.0, f + BEZ_D + 2.0, zt + 0.2, zt + 1.8))
    y_clip = min(f + BEZ_D - 7, y_press) - 1.0                    # the tongues and post tips reach into the bezel
    back = I(U([back, *adds]), U([monitor_back_solid(), slab(-300, 300, y_clip, f + BEZ_D + 0.01, -10, 400)]))
    bcuts = []
    for dx, dy in STAND_MON_SCREWS:                               # through the block: no thin cap to print
        if STAND_Y + dy > f + BEZ_D:
            bcuts.append(cyl(dx, STAND_Y + dy, z0 - 1, z0 + 11, PILOT))
    bcuts.append(ribbon_slot(z0 - 1, z0 + 11))                     # screen ribbon and power wires, into the stand
    # perforated grilles on both sides and on top: cut through the walls only, so the posts stay whole
    cols_y = [f + BEZ_D + 40 + 9 * j for j in range(7)]
    for y in cols_y:
        hw0, h0 = back_size(y)
        hw1, h1 = back_size(y + 6.0)
        for s in (-1, 1):
            xa, xb = hw1 - WALL - 0.6, hw0 + 1.0
            for i in range(9):
                z = z0 + 24 + 8 * i
                bcuts.append(slab(min(s * xa, s * xb), max(s * xa, s * xb), y, y + 6.0, z, z + 2.2))
        for i in range(17):
            x = -48 + 6 * i
            bcuts.append(slab(x - 1.1, x + 1.1, y, y + 6.0, z0 + h1 - WALL - 0.6, z0 + h0 + 1.0))
    back = single(D(back, *bcuts), "PixelMonitorBack")
    return bezel, back


def build_fit_test():
    """Thin frame with the glass pocket and the window: the screen must drop in, the picture must fill the window."""
    sw, sh = SCR_W + 2 * SCR_CLR, SCR_H + 2 * SCR_CLR
    frame = rrect(sw + 6, sh + 6, 3.0).difference(rrect(sw, sh, 0.5))
    lipf = rrect(sw + 6, sh + 6, 3.0).difference(rrect(WIN_W, WIN_H, WIN_R, VIEW_DX, VIEW_DZ))
    return single(U([ext_xy(lipf, 0, 2.0), ext_xy(frame, 2.0 - OVER, 6.0)]), "ScreenFitTest")


def build_sd_fit_test():
    """Stream Deck fit test, in the keyboard's local frame (w = 0 is the top plate's underside): the keyboard top's
    plate cropped to the module pocket, with the same 15 key windows, on a rim of the base's module pocket down to
    the ledge. Pressed onto the bare module, the keys must pass freely and the module must drop in to the rim's edge."""
    u0, u1, v0, v1 = mod_pocket()
    pocket = box(u0, v0, u1, v1)
    outer = rrect(u1 - u0 + 2 * SDTEST_RIM, v1 - v0 + 2 * SDTEST_RIM, SDTEST_RIM + 1.0, (u0 + u1) / 2, (v0 + v1) / 2)
    plate = ext_xy(outer, 0, KB_TOP_T)
    rim = ext_xy(outer.difference(pocket), -MOD_DEPTH, OVER)
    cuts = [ext_xy(w, -1, KB_TOP_T + 1) for w in kb_key_windows()]
    v_win = max(w.bounds[3] for w in kb_key_windows())           # label in the free band behind the top key row
    size = min(4.0, (v1 + SDTEST_RIM - v_win) - 2.5)
    cuts += engrave_top(text_centred("SD TEST", size, 0, (v_win + v1 + SDTEST_RIM) / 2), KB_TOP_T, 0.6)
    return single(D(U([plate, rim]), *cuts), "StreamDeckFitTest")


# ------------------------------------------------------------------ print poses
def pose_matrix(m, kind):
    rot = {"upright": None, "top_down": (np.pi, [1, 0, 0]), "face_down": (np.pi / 2, [1, 0, 0]),
           "back_down": (-np.pi / 2, [1, 0, 0])}[kind]
    R = trimesh.transformations.rotation_matrix(*rot) if rot else np.eye(4)
    mm = m.copy(); mm.apply_transform(R)
    return trimesh.transformations.translation_matrix([-mm.centroid[0], -mm.centroid[1], -mm.bounds[0][2]]) @ R


def pose(m, kind, like=None):
    """Print orientation. like=other part: use that part's transform (multi-material parts stay aligned)."""
    mm = m.copy(); mm.apply_transform(pose_matrix(like if like is not None else m, kind))
    return mm


def build_all():
    tray, case, plate, stand = build_tray(), build_case(), build_case_bottom(), build_stand()
    bezel, back = build_monitor()
    kb_base, kb_top, kb_top_local, kb_leds, kb_leds_local = build_keyboard()
    adapter_local = build_adapter()
    assembled = dict(PixelKeyboardBase=kb_base, PixelKeyboardTop=kb_top, PixelCase=case, PixelCaseBottom=plate,
                     PixelStand=stand, PixelMonitorFront=bezel, PixelMonitorBack=back,
                     PixelScreenPowerAdapter=pi_local(adapter_local))
    printable = {
        "PixelMonitorFront": pose(bezel, "face_down"), "PixelMonitorBack": pose(back, "back_down"),
        "PixelStand": pose(stand, "top_down"), "PixelCase": pose(case, "top_down"),
        "PixelCaseBottom": pose(plate, "upright"), "PixelKeyboardBase": pose(kb_base, "upright"),
        "PixelKeyboardTop": pose(kb_top_local, "top_down"),
        "PixelScreenPowerAdapter": pose(adapter_local, "upright"),
        "PixelStreamDeckTray": pose(tray, "upright"),
        "ScreenFitTest": build_fit_test(),
        "StreamDeckFitTest": pose(build_sd_fit_test(), "top_down"),
    }
    if V2_PANEL:
        assembled["PixelKeyboardLeds"] = kb_leds
        printable["PixelKeyboardLeds"] = pose(kb_leds_local, "top_down", like=kb_top_local)
    return assembled, printable


def main():
    OUT.mkdir(exist_ok=True)
    for old in OUT.glob("*.stl"):                                 # no stale parts from the other version
        old.unlink()
    _, printable = build_all()
    total = 0.0
    print(f"Pixel {'v2' if V2_PANEL else 'v1'}  (V2_PANEL = {V2_PANEL})")
    for name, m in printable.items():
        m.export(OUT / f"{name}.stl")
        w, d, h = m.extents
        grams = filament_g(m)
        if name != "PixelStreamDeckTray":                         # the tray replaces the keyboard
            total += grams
        print(f"  {name:24s} {w:6.1f} x {d:6.1f} x {h:5.1f} mm   ~{grams:4.0f} g")
    print(f"  filament for the set (without the option tray): ~{total:.0f} g")


if __name__ == "__main__":
    main()
