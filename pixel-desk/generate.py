"""Pixel, retro edition: a beige 90s desktop PC that is really a Raspberry Pi 4.

- The "CRT monitor" holds a 7" touch screen (Freenove 7", blue-board version, 800x480, DSI).
- The "desktop case" holds the Raspberry Pi 4 and the wiring. Its front panel shows engraved fake buttons
  and LEDs (v1) or holds real ones (v2, see V2_PANEL).
- The "keyboard" is the inner module of a Stream Deck MK.2 in a printed retro keyboard.
- The screen takes its 5 V from the Pi's GPIO with 2 Dupont wires (pins 4 and 6): no soldering anywhere.
No moving parts. One cable: the Pi's USB-C power.

Parts (stl/), each exported in its print orientation, no supports needed:
    PixelMonitorFront.stl        bezel; the screen sits on its lip, centred by small ribs (prints face-down)
    PixelMonitorBack.stl         tapered CRT back with vents and 4 posts on the screen's brass rings (prints back-down)
    PixelStand.stl               round swivel foot under the monitor (prints top-down)
    PixelCase.stl                desktop case shell (prints top-down)
    PixelCaseBottom.stl          bottom plate, the Pi is screwed on it (prints flat)
    PixelKeyboardBase.stl        retro keyboard that holds the Stream Deck MK.2's inner module (prints upright)
    PixelKeyboardTop.stl         beige keyboard top with the 15 key holes (prints top-down)
    PixelStreamDeckTray.stl      option: low tray for a whole, unopened Stream Deck MK.2 (prints upright)
    ScreenFitTest.stl            thin frame to check the screen size before the big prints
    ScreenMountTest.stl          the bezel's glass zone cut short: window, pocket with its ribs, rim as deep as
                                 tape + glass + PCB, back open (prints face-down, quick)
    ScreenPostTest.stl           one short post with the real cup, to try on a brass ring of the screen (prints upright)
    StreamDeckFitTest.stl        the keyboard top's key field on a short rim of the module pocket: press it on the
                                 bare Stream Deck module to check the 15 key windows before the keyboard (prints flat)
  v2 only (V2_PANEL = True):
    PixelKeyboardLeds.stl        translucent bar for the 3 keyboard LED windows (same position as the top:
                                 load both as one object in the slicer to print it in translucent filament)

    pip install trimesh manifold3d shapely mapbox_earcut numpy scipy matplotlib pillow
    python3 generate.py            # then: python3 tools/verify.py

Coordinates: X = left/right, Y = front (0) to back, Z = up. Units: mm.
Values marked [measure] are estimates (from the user's photo of the screen's back): check them on the real screen.
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

# Freenove 7" touch screen, blue-board version (800 x 480, DSI): glass on the front, blue PCB on the back.
# Measured on the real screen (glass size checked with ScreenFitTest: a 166 x 100 pocket fits).
SCR_W, SCR_H = 164.5, 98.5                      # cover glass
SCR_T = 10.0                                    # glass front -> back face of the blue PCB
SCR_CLR = 0.75
SCR_PCB_T = 1.6                                 # blue PCB thickness (for the mock-up)
SCR_HOLE_IN = 6.0                               # 4 corner mounting holes: centres 6 mm from each glass edge
SCR_NUT_D, SCR_NUT_H = 5.0, 3.0                 # brass ring around each hole, sticking out of the PCB [measure]
SCR_BACK_FREE = 12.0                            # free depth behind the PCB (connectors, ribbon, wires)
SCR_BORDER = dict(left=3.0, right=7.0, top=4.0, bottom=8.0)   # black border around the picture, seen from the front
PIC_W = SCR_W - SCR_BORDER["left"] - SCR_BORDER["right"]       # picture size
PIC_H = SCR_H - SCR_BORDER["top"] - SCR_BORDER["bottom"]
PIC_DX = (SCR_BORDER["left"] - SCR_BORDER["right"]) / 2        # picture centre vs glass centre (it is off-centre)
PIC_DZ = (SCR_BORDER["bottom"] - SCR_BORDER["top"]) / 2
# The window is symmetric about the glass centre: it shows the whole picture whichever way up (or mirrored) the
# screen goes in, with WIN_MARGIN, and is at least WIN_MIN (measured on the printed test).
WIN_MARGIN = 1.0
WIN_MIN = (152.0, 93.5)
WIN_W = max(WIN_MIN[0], PIC_W + 2 * abs(PIC_DX) + 2 * WIN_MARGIN)
WIN_H = max(WIN_MIN[1], PIC_H + 2 * abs(PIC_DZ) + 2 * WIN_MARGIN)
WIN_R = 2.0
VIEW_DX, VIEW_DZ = 0.0, 0.0                     # window centre vs glass centre
LIP_MIN = 2.0                                   # the lip over the glass (the back's posts hold the glass on it)
# Parts on the PCB's back, from the user's photo (X, Z of the centre vs the glass centre seen from the FRONT,
# size along X, along Z, height above the PCB). The screen may go in either way up (180 deg): everything behind
# the PCB is kept free except at the 4 corner holes, and verify.py checks both ways.
SCR_DSI = (-44.9, -9.8, 6.0, 26.0, 3.0)         # DSI ribbon connector; the ribbon leaves it towards -X [measure]
SCR_PWR = (-44.9, -29.8, 9.0, 8.0, 7.0)         # white 2-pin power connector + plug, wires towards -Z [measure]
SCR_SWITCH = (60.2, 46.2, 7.5, 3.5, 3.0)        # "Backlight" slide switch, next to the top edge [measure]
SCR_PI_POSTS = ([-36.2, 21.8], [16.5, -32.5], 5.0, 6.0)   # brass standoffs for a Pi: X, Z, diameter, height [measure]
# The screen sits on the bezel lip; 4 posts of the CRT back press on its 4 brass rings, so it cannot fall
# backwards. No screws in the screen, no tape, no latch.
SCR_POST_D = 9.0                                # posts: diameter (+ 2 ribs each, out to the CRT back's walls)
SCR_POST_RIB = 2.4                              # rib thickness
SCR_CUP_D, SCR_CUP_H = 5.6, 1.5                 # cup at the post's end, over the brass ring (centres it)
SCR_SQUEEZE = 0.3                               # the cup's bottom is this far into the ring's tip: the closed back
                                                # presses the glass onto the lip
TAKEUP_T = 1.0                                  # optional 1 mm felt / rubber dot in each cup, if there is play
# Optional: double-sided foam tape between the black border and the lip (TAPE_T > 0 moves the glass back).
TAPE_T = 0.0                                    # 0: the glass sits directly on the lip
TAPE_GAP, TAPE_EDGE = 0.5, 0.5                  # tape strips: this far from the window edge and from the glass edge
SCR_RIB = 0.3                                   # small ribs in the pocket walls centre the glass (0.6 was too tight on the print)
SCR_RIB_W = 3.0                                 # (they leave SCR_CLR - SCR_RIB = 0.45 mm all around)
SCR_RIBS = dict(x=[-50.0, 50.0], z=[-25.0, 25.0])   # rib positions on the top/bottom walls (X) and the sides (Z)
# ScreenMountTest: the bezel's glass zone, cut short (quick print)
SMT_LIP = 2.0                                   # lip in front of the tape (the real bezel's is FUNNEL deep)
SMT_WALL = 2.0                                  # rim around the glass pocket
SMT_MARGIN = 0.4                                # the rim is this much deeper than tape + glass + PCB

SCR_PWR_PINS = (4, 6)                           # the screen's 5 V and GND Dupont wires go on these Pi pins

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
# front-panel parts: engraved fakes in v1, real parts held by their own nuts in v2 (centres: X, Z). The real power
# button is on the monitor (MON_BTN): the case's power button stays an engraved decor, in v2 too.
PWR_XZ, PWR_HOLE = (76.0, 51.0), 16.2           # engraved power button with its ring (decor)
TURBO_XZ, TURBO_HOLE = (56.0, 51.0), 12.2       # 12 mm momentary button, the "Turbo" of old PCs
LED3_X, LED3_Z, LED3_HOLE = (24.0, 32.0), 51.0, 5.0   # two 3 mm LEDs in chrome holders: power, activity
LED5_XZ, LED5_HOLE = (42.0, 51.0), 8.0          # 5 mm addressable RGB LED in a chrome holder: notifications

DUPONT = (2.6, 14.0)                            # female Dupont housing on the Pi's pins: section, length

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
SCR_BOTTOM = 24.0                               # glass bottom above the monitor's bottom (the "chin": the power button)
BEZ_WALL, BEZ_TOP = 9.0, 13.0                   # bezel around the glass pocket: sides, top (holds the back's top screws)
FUNNEL = 5.0                                    # sunken screen: 45 deg funnel depth (the lip in front of the tape)
LIP_EDGE = 1.3                                  # the lip's straight edge at the window (no knife edge on a 2 mm lip)
BEZ_RIM = 2.0                                   # the pocket's rim stands this much behind the PCB's back
BEZ_D = FUNNEL + TAPE_T + SCR_T + BEZ_RIM
BEZ_R, BEZ_CHAMFER = 7.0, 1.5
BEZ_W = SCR_W + 2 * SCR_CLR + 2 * BEZ_WALL
BEZ_H = SCR_BOTTOM + SCR_H + SCR_CLR + BEZ_TOP
BACK_STEP = 2.0                                 # the CRT back is this much smaller than the bezel (sides, top)
BACK_TAPER_W, BACK_TAPER_H = 30.0, 20.0         # its rear end is this much narrower / lower than its front
BACK_FRONT_W, BACK_FRONT_H = BEZ_W - 2 * BACK_STEP, BEZ_H - 2 * BACK_STEP
BACK_W, BACK_H, BACK_D, BACK_R = BACK_FRONT_W - BACK_TAPER_W, BACK_FRONT_H - BACK_TAPER_H, 105.0, 8.0
TONGUE_X = 55.0                                 # the back hooks into the bezel with two tongues at the top
# The power button, on the monitor's chin at the bottom right like an old CRT: a 12 mm momentary metal button,
# pre-wired (15 cm leads), IP65, M12 body. It replaces the engraved one. A pocket from behind leaves BTN_WALL
# of bezel in front, for its nut.
MON_BTN_X, MON_BTN_Z = 75.0, 11.5               # centre: X, height above the monitor's bottom
BTN_HOLE = 12.2
BTN_HEAD_D, BTN_HEAD_T = 14.0, 2.0              # round head with its ring, in front [measure]
BTN_BODY_D, BTN_BODY_L = 12.0, 20.0             # body behind the panel
BTN_NUT_D, BTN_NUT_T = 16.0, 2.5                # hex nut (across corners)
BTN_WALL, BTN_POCKET_D = 2.4, 19.0              # bezel left in front of the pocket, pocket diameter (room for the nut)
BTN_PINS = (5, 9)                               # its 2 wires: GPIO 3 (pin 5) and GND (pin 9), via Dupont + Wago
BTN_LEAD = 150.0                                # its leads
# 4 screws hold the CRT back on the bezel, so the posts keep their place: 2 from above (through the back's top) and
# 2 from below (through its floor), each into a tab on the bezel's rear face. M2.5 x 8, self-tapping in the tab.
BACK_SCREWS_TOP_X, BACK_SCREWS_BOT_X = 30.0, 30.0
BACK_TAB = (10.0, 9.0, 6.0)                     # tab: width (X), length behind the bezel (Y), thickness (Z)
BACK_TAB_CLR = 0.3                              # tab to the back's walls


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
    """v2: real holes in the case's front panel (the power button is on the monitor)."""
    return [(TURBO_XZ, TURBO_HOLE), (LED5_XZ, LED5_HOLE)] + [((x, LED3_Z), LED3_HOLE) for x in LED3_X]


def power_fake():
    """The case's engraved power button (v1 and v2: the real one is on the monitor)."""
    px, pz = PWR_XZ
    return [ring(px, pz, PWR_HOLE + 2.6, PWR_HOLE + 1.0), disc(px, pz, 9.0)]


def front_panel_fakes():
    """v1: engraved fakes of the v2 front-panel parts, at the same places."""
    (tx, tz), (lx, lz) = TURBO_XZ, LED5_XZ
    marks = power_fake() + [ring(tx, tz, TURBO_HOLE + 2.4, TURBO_HOLE + 0.8), disc(tx, tz, 6.0),   # Turbo button
             ring(lx, lz, LED5_HOLE + 1.6, LED5_HOLE), disc(lx, lz, 3.2)]                 # notification LED
    marks += [ring(x, LED3_Z, LED3_HOLE + 1.4, LED3_HOLE - 0.2) for x in LED3_X]          # power and activity LEDs
    marks += [disc(x, LED3_Z, 2.0) for x in LED3_X]
    return marks


def teardrop(x, z, d, cap=None):
    """Round hole with a small point at the bottom: the case prints upside down, so the point is the
    top of the hole on the printer and needs no support. The part's own flange hides it. cap: cut the point
    flat this far below the centre (a short bridge), so a smaller head still hides it."""
    r = d / 2
    c = Point(x, z).buffer(r, quad_segs=24)
    t = c.union(Polygon([(x - r * 0.7071, z - r * 0.7071), (x, z - r * 1.4142), (x + r * 0.7071, z - r * 0.7071)]))
    return t.intersection(box(x - d, z - cap, x + d, z + d)) if cap else t


def mon_btn():
    """X, Z of the monitor's power button, and the Y range of its body behind the bezel's front."""
    return MON_BTN_X, MON_Z0 + MON_BTN_Z, MON_F + BTN_WALL, MON_F + BTN_WALL + BTN_BODY_L


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
    det += front_panel_fakes() if not V2_PANEL else power_fake()
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


# ------------------------------------------------------------------ screen in the monitor
def screen_box():
    """Centre of the glass (X, Z)."""
    return 0.0, MON_Z0 + SCR_BOTTOM + SCR_H / 2


def view_centre():
    cx, cz = screen_box()
    return cx + VIEW_DX, cz + VIEW_DZ


def y_lip():
    return MON_F + FUNNEL                          # back face of the lip: the tape goes here


def y_glass():
    return y_lip() + TAPE_T                        # front face of the glass


def y_pcb_back():
    return y_glass() + SCR_T                       # back face of the blue PCB


def gpio_xy(pin):
    """Centre of a GPIO pin (1..40) in Pi-board coordinates."""
    col = (pin - 1) // 2
    return GPIO_X1 + 2.54 * col, GPIO_Y + (1.27 if pin % 2 == 0 else -1.27)


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


def tongue_z():
    return MON_Z0 + BACK_FRONT_H - 2.2


def cup_y():
    """Y of the post cups: (front rim, bottom). The bottom is SCR_SQUEEZE into the brass ring's tip."""
    tip = y_glass() + SCR_T + SCR_NUT_H
    return tip - SCR_SQUEEZE - SCR_CUP_H, tip - SCR_SQUEEZE


def back_tabs():
    """The 4 tabs on the bezel's rear face for the back's screws: (x, z0, z1, top) with the tab's Z range and
    whether the screw comes from above (top) or from below. The screw axis is vertical at (x, back_screw_y())."""
    y1 = MON_F + BEZ_D + BACK_TAB[1]
    _, h1 = back_size(y1)
    top_z1 = MON_Z0 + h1 - WALL - BACK_TAB_CLR - 0.6                 # under the back's (sloping) top wall
    bot_z0 = MON_Z0 + WALL + BACK_TAB_CLR
    glass_top = screen_box()[1] + SCR_H / 2 + 0.3                    # the top tabs stay above the PCB's edge
    t_top = min(BACK_TAB[2], top_z1 - glass_top)
    out = [(s * BACK_SCREWS_TOP_X, top_z1 - t_top, top_z1, True) for s in (-1, 1)]
    out += [(s * BACK_SCREWS_BOT_X, bot_z0, bot_z0 + BACK_TAB[2], False) for s in (-1, 1)]
    return out


def back_screw_y():
    return MON_F + BEZ_D + BACK_TAB[1] / 2


def build_monitor():
    f, z0 = MON_F, MON_Z0
    cx, cz = screen_box()
    vx, vz = view_centre()
    # ---------- bezel (solid, printed face-down)
    front = hull(ext_xz(rrect(BEZ_W - 2 * BEZ_CHAMFER, BEZ_H - 2 * BEZ_CHAMFER, BEZ_R - BEZ_CHAMFER, 0, z0 + BEZ_H / 2), f, f + 0.01),
                 ext_xz(rrect(BEZ_W, BEZ_H, BEZ_R, 0, z0 + BEZ_H / 2), f + BEZ_CHAMFER, f + BEZ_D))
    sw, sh = scr_pocket()
    cuts = [pocket_cut(cx, cz, f + FUNNEL, f + BEZ_D + 1)]                                     # glass pocket + ribs
    fs = FUNNEL - LIP_EDGE                                          # 45 deg funnel, then a straight edge at the glass
    funnel = hull(ext_xz(rrect(WIN_W, WIN_H, WIN_R, vx, vz), f + fs - 0.01, f + fs + 0.01),
                  ext_xz(rrect(WIN_W + 2 * fs, WIN_H + 2 * fs, WIN_R + fs * 0.5, vx, vz), f - 0.01, f + 0.01))
    cuts += [funnel, ext_xz(rrect(WIN_W, WIN_H, WIN_R, vx, vz), f + fs - 0.02, f + FUNNEL + 0.5)]
    # tongue slots for the back
    zt = tongue_z()
    for s in (-1, 1):
        cuts.append(slab(s * TONGUE_X - 5.2, s * TONGUE_X + 5.2, f + BEZ_D - 6.5, f + BEZ_D + 0.5, zt, zt + 2.0))
    for dx, dy in STAND_MON_SCREWS:
        if STAND_Y + dy < f + BEZ_D:
            cuts.append(cyl(dx, STAND_Y + dy, z0 - 1, z0 + 12, PILOT))
    ys = back_screw_y()
    for x, ta, tb, _ in back_tabs():                                 # pilots for the back's 4 screws
        cuts.append(cyl(x, ys, ta - 1, tb + 1, PILOT))
    # engraved controls under the screen: badge, knobs, LED, power button
    # and the real power button at the bottom right, in a pocket from behind (BTN_WALL left for its nut)
    bx, bz, _, _ = mon_btn()
    zc = bz
    det = [text_poly("PIXEL", 7.0, -78.0, zc - 3.3), ring(38, zc, 4.6, 3.0), ring(46, zc, 4.6, 3.0), ring(54, zc, 4.6, 3.0),
           rrect(5.0, 1.8, 0.6, 63.5, zc), ring(bx, bz, BTN_HEAD_D + 3.0, BTN_HEAD_D + 1.6)]
    for p in det:
        cuts.append(engrave_front(p, f, 0.7))
    cuts += [cyl_y(bx, bz, f - 1, f + BTN_WALL + 0.01, BTN_HOLE, sections=48),
             cyl_y(bx, bz, f + BTN_WALL, f + BEZ_D + 1, BTN_POCKET_D, sections=48)]
    tabs = [slab(x - BACK_TAB[0] / 2, x + BACK_TAB[0] / 2, f + BEZ_D - OVER, f + BEZ_D + BACK_TAB[1], ta, tb)
            for x, ta, tb, _ in back_tabs()]
    bezel = single(D(U([front, *tabs]), *cuts), "PixelMonitorFront")

    # ---------- tapered CRT back (shell, printed back-down)
    back = D(monitor_back_solid(), monitor_back_solid(WALL, open_front=True))
    adds = []
    # bottom block for the stand screws
    # (ends in a 45 deg ramp so it prints without support)
    yb0, yb1 = STAND_Y - 16.0, STAND_Y + 16.0
    adds.append(hull(slab(-26, 26, yb0, yb1, z0 + 0.5, z0 + 10), slab(-26, 26, yb1, yb1 + 9.5, z0 + 0.5, z0 + 1.0)))
    # tongues reaching into the bezel
    for s in (-1, 1):
        adds.append(slab(s * TONGUE_X - 4.8, s * TONGUE_X + 4.8, f + BEZ_D - 6.0, f + BEZ_D + 2.0, zt + 0.2, zt + 1.8))
    # 4 posts on the screen's brass rings, each with 2 ribs out to the side wall and to the top wall / the floor
    # (everything outside the back's outer shape is cut off below, so they merge into the walls)
    c0, _ = cup_y()
    y_end = f + BEZ_D + BACK_D - 0.37                              # (not on the back's rear face)
    for px, pz in scr_holes(cx, cz):
        sx, sz = np.sign(px - cx), np.sign(pz - cz)
        r = SCR_POST_RIB / 2
        adds.append(cyl_y(px, pz, c0, y_end, SCR_POST_D))
        adds.append(slab(min(px, px + sx * 40), max(px, px + sx * 40), f + BEZ_D + 0.53, y_end, pz - r, pz + r))
        y_rib = f + BEZ_D + 0.57 if sz > 0 else mon_btn()[3] + 5.0      # the lower ones leave room for the button
        adds.append(slab(px - r, px + r, y_rib, y_end, min(pz, pz + sz * 80), max(pz, pz + sz * 80)))
    y_clip = f + BEZ_D - 8.0                                      # the tongues reach into the bezel
    back = I(U([back, *adds]), U([monitor_back_solid(), slab(-300, 300, y_clip, f + BEZ_D + 0.01, -10, 400)]))
    bcuts = []
    for dx, dy in STAND_MON_SCREWS:                               # through the block: no thin cap to print
        if STAND_Y + dy > f + BEZ_D:
            bcuts.append(cyl(dx, STAND_Y + dy, z0 - 1, z0 + 11, PILOT))
    bcuts.append(ribbon_slot(z0 - 1, z0 + 11))                     # screen ribbon and power wires, into the stand
    c0, c1 = cup_y()
    for px, pz in scr_holes(cx, cz):                                # the cups over the brass rings
        bcuts.append(cyl_y(px, pz, c0 - 1, c1, SCR_CUP_D))
    ys = back_screw_y()
    for x, ta, tb, top in back_tabs():                              # clearance holes for the 4 screws to the bezel
        bcuts.append(cyl(x, ys, tb - 0.5, z0 + BEZ_H, CLEAR) if top else cyl(x, ys, z0 - 1, ta + 0.5, CLEAR))
    # perforated grilles on both sides and on top
    cols_y = [f + BEZ_D + 34 + 9 * j for j in range(7)]
    for y in cols_y:
        hw0, h0 = back_size(y)
        hw1, h1 = back_size(y + 6.0)
        for s in (-1, 1):
            xa, xb = hw1 - WALL - 0.6, hw0 + 1.0
            for i in range(8):
                z = z0 + 34 + 8 * i                                 # above the lower posts
                bcuts.append(slab(min(s * xa, s * xb), max(s * xa, s * xb), y, y + 6.0, z, z + 2.2))
        for i in range(15):
            x = -42 + 6 * i
            bcuts.append(slab(x - 1.1, x + 1.1, y, y + 6.0, z0 + h1 - WALL - 0.6, z0 + h0 + 1.0))
    back = single(D(back, *bcuts), "PixelMonitorBack")
    return bezel, back


def build_fit_test():
    """Thin frame with the glass pocket and the window: the screen must drop in, the picture must fill the window."""
    sw, sh = SCR_W + 2 * SCR_CLR, SCR_H + 2 * SCR_CLR
    frame = rrect(sw + 6, sh + 6, 3.0).difference(rrect(sw, sh, 0.5))
    lipf = rrect(sw + 6, sh + 6, 3.0).difference(rrect(WIN_W, WIN_H, WIN_R, VIEW_DX, VIEW_DZ))
    return single(U([ext_xy(lipf, 0, 2.0), ext_xy(frame, 2.0 - OVER, 6.0)]), "ScreenFitTest")


# ------------------------------------------------------------------ screen mounting (blue-board screen, taped)
# Local screen frame: (cx, cz) = glass centre seen from the front. The lip's back face (where the tape goes) is
# at Y = y_lip; the glass's front face is TAPE_T behind it.
def scr_pocket():
    return SCR_W + 2 * SCR_CLR, SCR_H + 2 * SCR_CLR


def scr_holes(cx=0.0, cz=0.0):
    """Centres of the 4 corner holes (brass rings), seen from the front."""
    hx, hz = SCR_W / 2 - SCR_HOLE_IN, SCR_H / 2 - SCR_HOLE_IN
    return [(cx + sx * hx, cz + sz * hz) for sx in (-1, 1) for sz in (-1, 1)]


def scr_ribs(cx=0.0, cz=0.0):
    """Centring ribs on the pocket walls, (X, Z) outlines: SCR_RIB into the pocket, 0.5 mm into the wall."""
    pw, ph = scr_pocket()
    out = []
    for x in SCR_RIBS["x"]:
        for s in (-1, 1):
            z0, z1 = s * (ph / 2 - SCR_RIB), s * (ph / 2 + 0.5)
            out.append(box(cx + x - SCR_RIB_W / 2, cz + min(z0, z1), cx + x + SCR_RIB_W / 2, cz + max(z0, z1)))
    for z in SCR_RIBS["z"]:
        for s in (-1, 1):
            x0, x1 = s * (pw / 2 - SCR_RIB), s * (pw / 2 + 0.5)
            out.append(box(cx + min(x0, x1), cz + z - SCR_RIB_W / 2, cx + max(x0, x1), cz + z + SCR_RIB_W / 2))
    return out


def pocket_cut(cx, cz, y0, y1):
    """The glass pocket with its centring ribs, from y0 to y1."""
    pw, ph = scr_pocket()
    return ext_xz(rrect(pw, ph, 0.5, cx, cz).difference(unary_union(scr_ribs(cx, cz))), y0, y1)


def tape_strips(cx=0.0, cz=0.0):
    """Double-sided tape on the lip, (X, Z) outlines: on the glass's black border only, TAPE_GAP outside the window
    and TAPE_EDGE inside the glass edge. A long strip on each side, a short narrow one at the top and the bottom."""
    xw, zw = WIN_W / 2 + TAPE_GAP, WIN_H / 2 + TAPE_GAP
    xg, zg = SCR_W / 2 - TAPE_EDGE, SCR_H / 2 - TAPE_EDGE
    vx, vz = cx + VIEW_DX, cz + VIEW_DZ
    sides = [box(vx + xw, cz - zg, cx + xg, cz + zg), box(cx - xg, cz - zg, vx - xw, cz + zg)]
    ends = [box(vx - xw, vz + zw, vx + xw, cz + zg), box(vx - xw, cz - zg, vx + xw, vz - zw)]
    return sides + ends


def tape_widths():
    """Width of the side strips and of the top / bottom strips."""
    s, _, e, _ = tape_strips()
    return s.bounds[2] - s.bounds[0], e.bounds[3] - e.bounds[1]


def build_mount_test():
    """ScreenMountTest, in the local screen frame (glass centre at X = Z = 0, lip's back face at Y = 0): the bezel's
    glass zone cut short. A thin lip with the real window, and the real pocket (with its centring ribs) in a rim
    SMT_MARGIN deeper than tape + glass + PCB. Everything behind the PCB is open."""
    pw, ph = scr_pocket()
    outer = rrect(pw + 2 * SMT_WALL, ph + 2 * SMT_WALL, SMT_WALL + 0.5)
    lip = ext_xz(outer.difference(rrect(WIN_W, WIN_H, WIN_R, VIEW_DX, VIEW_DZ)), -SMT_LIP, 0.0)
    rim = D(ext_xz(outer, -OVER, TAPE_T + SCR_T + SMT_MARGIN), pocket_cut(0.0, 0.0, -1.0, TAPE_T + SCR_T + SMT_MARGIN + 1))
    band = (ph / 2 + SMT_WALL + WIN_H / 2) / 2                       # middle of the lip's bottom band
    cut = engrave_front(text_centred("TEST ECRAN", 3.6, 0, VIEW_DZ - band), -SMT_LIP, 0.6)
    return single(D(U([lip, rim]), cut), "ScreenMountTest")


def build_post_test():
    """ScreenPostTest (prints upright): a short post with the real cup, to try on a brass ring of the screen."""
    h, t = 10.0, 1.6
    body = U([cyl(0, 0, 0, t, 16.0, sections=48), cyl(0, 0, t - OVER, h, SCR_POST_D, sections=48)])
    return single(D(body, cyl(0, 0, h - SCR_CUP_H, h + 1, SCR_CUP_D, sections=48)), "ScreenPostTest")


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
    assembled = dict(PixelKeyboardBase=kb_base, PixelKeyboardTop=kb_top, PixelCase=case, PixelCaseBottom=plate,
                     PixelStand=stand, PixelMonitorFront=bezel, PixelMonitorBack=back)
    printable = {
        "PixelMonitorFront": pose(bezel, "face_down"), "PixelMonitorBack": pose(back, "back_down"),
        "PixelStand": pose(stand, "top_down"), "PixelCase": pose(case, "top_down"),
        "PixelCaseBottom": pose(plate, "upright"), "PixelKeyboardBase": pose(kb_base, "upright"),
        "PixelKeyboardTop": pose(kb_top_local, "top_down"),
        "PixelStreamDeckTray": pose(tray, "upright"),
        "ScreenFitTest": build_fit_test(),
        "ScreenMountTest": pose(build_mount_test(), "face_down"),
        "ScreenPostTest": build_post_test(),
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
