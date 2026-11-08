"""Mock-ups of the bought parts, placed like in the real Pixel: used by verify.py (collision checks) and
render.py (pictures). All sizes come from generate.py, so the mocks follow any change made there.

    import mocks; g = mocks.g        # g is pixel-desk/generate.py
"""
import sys
from pathlib import Path

import numpy as np
from shapely.geometry import Polygon

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import generate as g  # noqa: E402


# ------------------------------------------------------------------ Stream Deck
def deck():
    """Whole Stream Deck MK.2 in the option tray, with its 90 deg USB-C plug."""
    dp = g.deck_pose(); d0, u, n = dp["deck0"], dp["u"], dp["n"]
    body = g.ext_yz(Polygon([tuple(d0), tuple(d0 + g.SD_H * u), tuple(d0 + g.SD_H * u + g.SD_T * n), tuple(d0 + g.SD_T * n)]),
                    -g.SD_W / 2, g.SD_W / 2)
    p = d0 + (g.SD_H - 27) * u                     # USB-C on the back, 27 mm below the top edge
    plug = g.ext_yz(Polygon([tuple(p - 4 * u), tuple(p + 4 * u), tuple(p + 4 * u - 9 * n), tuple(p - 4 * u - 9 * n)]),
                    g.SD_CABLE_X - 6, g.SD_CABLE_X + 6)
    return body, plug, dp


def sd_module():
    """Stream Deck MK.2 inner module in the keyboard: body, 15 keys, USB-C connector, 90 deg plug."""
    body = g.kb_box(-g.MOD_W / 2, g.MOD_W / 2, g.MOD_V0, g.MOD_V0 + g.MOD_H, -g.MOD_T, 0)
    keys = []
    for x in g.MOD_KEY_X:
        for y in g.MOD_KEY_Y:
            u, v = g.module_uv(x, y)
            keys.append(g.kb_local(g.ext_xy(g.rrect(16.25, 16.25, 3.2, u, v), 0, 3.0)))   # rounded like the real keys
    cu, cv = g.module_uv(*g.MOD_CONN)
    conn = g.kb_box(cu - 4.5, cu + 4.5, cv - 4.2, cv + 4.2, -g.MOD_T - g.MOD_CONN_DEPTH, -g.MOD_T + 0.01)
    plug = g.kb_box(cu - 6, cu + 6, cv - 6, cv + 6, -g.MOD_T - g.MOD_CONN_DEPTH - 7.0, -g.MOD_T - g.MOD_CONN_DEPTH)
    return body, keys, conn, plug


# ------------------------------------------------------------------ screen (Freenove 7", blue board)
def scr_spots(flip=False):
    """Parts on the PCB's back (generate.SCR_DSI, ...), turned 180 deg if flip (the screen put in the other way up)."""
    k = -1.0 if flip else 1.0
    spot = lambda t: (k * t[0], k * t[1], *t[2:])                          # noqa: E731
    xs, zs, d, h = g.SCR_PI_POSTS
    posts = [(k * x, k * z) for x in xs for z in zs]
    return dict(dsi=spot(g.SCR_DSI), pwr=spot(g.SCR_PWR), switch=spot(g.SCR_SWITCH), posts=posts, post_dh=(d, h), k=k)


def blue_screen(cx=0.0, cz=0.0, yg=0.0, flip=False):
    """The blue-board screen with the glass front at Y = yg and its centre at (cx, cz): glass + LCD block, PCB,
    the 4 brass rings, and what sits on the PCB's back (DSI connector + the ribbon's fold, power connector + plug +
    the 2 wires, Backlight switch, the Pi standoffs)."""
    yb = yg + g.SCR_T                                                      # PCB back
    sp = scr_spots(flip)
    k = sp["k"]
    parts = {"glass": g.ext_xz(g.rrect(g.SCR_W, g.SCR_H, 1.0, cx, cz), yg, yb - g.SCR_PCB_T),
             "pcb": g.ext_xz(g.rrect(g.SCR_W, g.SCR_H, 1.0, cx, cz), yb - g.SCR_PCB_T - 0.01, yb)}
    parts["rings"] = g.U([g.cyl_y(x, z, yb - 0.01, yb + g.SCR_NUT_H, g.SCR_NUT_D) for x, z in g.scr_holes(cx, cz)])
    def blk(t, y0=0.0):
        x, z, w, hz, h = t
        return box(cx + x - w / 2, cx + x + w / 2, yb + y0, yb + h, cz + z - hz / 2, cz + z + hz / 2)
    parts["dsi_connector"] = blk(sp["dsi"], -0.01)
    parts["power_connector"] = blk(sp["pwr"], -0.01)
    parts["backlight_switch"] = blk(sp["switch"], -0.01)
    d, h = sp["post_dh"]
    parts["pi_standoffs"] = g.U([g.cyl_y(cx + x, cz + z, yb - 0.01, yb + h, d) for x, z in sp["posts"]])
    # the ribbon leaves the DSI connector towards -X (seen from the front) and folds back into the free depth
    x, z, w, hz, _ = sp["dsi"]
    xe = x - k * w / 2
    parts["ribbon_fold"] = box(cx + xe, cx + xe - k * 12.0, yb + 0.3, yb + g.SCR_BACK_FREE, cz + z - 9.0, cz + z + 9.0)
    # the 2 power wires leave the plug towards -Z, lie on the PCB to its edge, then go back
    x, z, w, hz, _ = sp["pwr"]
    ze = z - k * hz / 2
    parts["power_wires"] = box(cx + x - 2.0, cx + x + 2.0, yb + 0.3, yb + 3.0, cz + ze, cz - k * (g.SCR_H / 2 - 1.0))
    return parts


def scr_free_zone(cx=0.0, cz=0.0, yg=0.0):
    """The free depth behind the PCB (SCR_BACK_FREE): nothing printed may go there."""
    yb = yg + g.SCR_T
    return g.ext_xz(g.rrect(g.SCR_W - 0.2, g.SCR_H - 0.2, 1.0, cx, cz), yb + 0.05, yb + g.SCR_BACK_FREE)


def tape(cx=0.0, cz=0.0, y_lip=0.0):
    """The double-sided tape strips, from the lip's back face to the glass (TAPE_T thick)."""
    return g.U([g.ext_xz(t, y_lip, y_lip + g.TAPE_T) for t in g.tape_strips(cx, cz)])


def box(x0, x1, y0, y1, z0, z1):
    """Box between two corners, in any order."""
    return g.slab(min(x0, x1), max(x0, x1), min(y0, y1), max(y0, y1), min(z0, z1), max(z0, z1))


def monitor_screen(flip=False):
    """The screen as it sits in the monitor, with its tape."""
    return {**blue_screen(*g.screen_box(), g.y_glass(), flip), "tape": tape(*g.screen_box(), g.y_lip())}


def ribbon_bundle():
    """The DSI ribbon and two Dupont plugs going down through the slots (monitor floor, stand, case top)."""
    x0, x1, y0, y1 = g.RIBBON_SLOT
    zb, zt = g.CASE_H - g.WALL - 3.0, g.MON_Z0 + 12.0
    ym = (y0 + y1) / 2
    ribbon = g.slab(-8.0, 8.0, y0 + 2.0, y0 + 2.4, zb, zt)                       # 16 mm ribbon, flat
    plugs = g.U([g.slab(x - 1.25, x + 1.25, ym + 1.0, ym + 3.5, zb, zt) for x in (-5.0, -1.5)])   # 2.5 mm housings
    return {"ribbon_in_slot": ribbon, "dupont_in_slot": plugs}


# ------------------------------------------------------------------ Raspberry Pi in the case
def pi_blocks(with_plugs=True):
    zb = g.PLATE_T + g.PI_STANDOFF; zt = zb + 1.4
    def blk(x0, x1, y0, y1, z0, z1):
        X0, Y0 = g.pi_xy(x1, y1); X1, Y1 = g.pi_xy(x0, y0)
        return g.slab(X0, X1, Y0, Y1, z0, z1)
    parts = {"board": blk(0, g.PI_L, 0, g.PI_W, zb, zt), "usb3": blk(66.0, 87.1, 2.0, 16.0, zt, zt + 16.0),
             "usb2": blk(66.0, 87.1, 20.0, 34.0, zt, zt + 16.0), "eth": blk(64.5, 87.1, 38.0, 54.0, zt, zt + 13.5),
             "usbc": blk(7.0, 15.4, -1.1, 6.0, zt, zt + 3.3), "hdmi0": blk(22.5, 29.5, -1.0, 6.5, zt, zt + 3.5),
             "hdmi1": blk(36.0, 43.0, -1.0, 6.5, zt, zt + 3.5), "audio": blk(50.0, 57.0, -2.0, 12.0, zt, zt + 6.0),
             "gpio": blk(7.0, 58.0, 49.5, 54.5, zt, zt + 8.5), "heatsink": blk(20.0, 45.0, 20.0, 45.0, zt, zt + 14.0),
             "dsi": blk(1.1, 5.1, 16.0, 39.0, zt, zt + 5.5), "sdcard": blk(-2.5, 12.0, 22.0, 34.0, zb - 1.1, zb)}
    if with_plugs:
        parts["plug_streamdeck"] = blk(87.1, 87.1 + 36.0, 21.0, 33.0, zt + 1.0, zt + 8.0)
        parts["plug_mic"] = blk(87.1, 87.1 + 18.0, 3.0, 15.0, zt + 1.0, zt + 7.0)
        parts["plug_power"] = blk(7.5, 15.0, -26.0, -1.1, zt, zt + 3.4)
        # the screen's 5 V and GND wires on GPIO pins 4 and 6 (Dupont plugs + 10 mm of wire)
        for p in g.SCR_PWR_PINS:
            hx, hy = g.gpio_xy(p)
            parts[f"plug_dupont{p}"] = blk(hx - 1.25, hx + 1.25, hy - 1.25, hy + 1.25, zt + 2.5, zt + 2.5 + g.DUPONT[1] + 10.0)
    return parts


def speaker():
    """v2: 40 mm speaker under the slots of the case top."""
    sx, sy = g.SPK_XY
    return g.cyl(sx, sy, g.CASE_H - g.WALL - g.SPK_H, g.CASE_H - g.WALL - 0.2, g.SPK_D)


def front_parts():
    """v2: real front-panel parts, body behind the panel, flange in front (power button, Turbo, LED holders)."""
    y0 = g.CASE_Y0
    spec = {"power": (g.PWR_XZ, 16.0, 19.0, 32.0, 3.0), "turbo": (g.TURBO_XZ, 12.0, 14.5, 26.0, 2.5),
            "led_rgb": (g.LED5_XZ, 7.8, 10.0, 12.0, 2.0)}
    for i, x in enumerate(g.LED3_X):
        spec[f"led3_{i}"] = ((x, g.LED3_Z), 4.8, 6.5, 10.0, 2.0)
    parts = {}
    for k, ((x, z), body_d, flange_d, depth, flange_t) in spec.items():
        parts[k] = g.U([g.cyl_y(x, z, y0 - 0.02, y0 + depth, body_d), g.cyl_y(x, z, y0 - flange_t, y0 - 0.02, flange_d)])
    return parts


def kb_led_strip():
    """v2: the 3-LED piece of WS2812B strip under the keyboard windows."""
    return g.kb_box(g.KB_LED_U[0] - 3.47, g.KB_LED_U[-1] + 3.47, g.KB_LED_V - 5.0, g.KB_LED_V + 5.0, -2.2, -0.02)
