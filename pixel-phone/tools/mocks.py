"""Bought things around the Pixel Phone, as simple volumes in the monitor frame (see generate.py): the phone (body,
screen, back camera, side keys), a thin case, the round Qi2 charger with its cable, and a USB-C plug.
Positions follow an insert's layout `lo` (generate.layout)."""
import sys
from pathlib import Path

import numpy as np
from shapely.ops import unary_union

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import generate as g  # noqa: E402

# a common USB-C plug: overmould (across, thickness, length), cable
USB_PLUG = (12.5, 6.8, 22.0)
USB_CABLE_D = 4.0


def phone_uvw(lo, u, v, w):
    """Phone frame -> monitor frame."""
    return np.array([lo["x0"] + u, lo["y_glass"] + w, lo["z0"] + v])


def body(lo, grow=0.0):
    """The phone without its case: a rounded slab (corners seen from the front)."""
    p = lo["p"]
    poly = g.rrect(p["L"] + 2 * grow, p["W"] + 2 * grow, p["R"] + grow, lo["x0"] + p["L"] / 2, lo["z0"] + p["W"] / 2)
    return g.ext_xz(poly, lo["y_glass"] - grow, lo["y_glass"] + p["T"] + grow)


def screen(lo):
    p = lo["p"]
    sw, sh = p["screen"]
    poly = g.rrect(sw, sh, 6.0, lo["x0"] + p["L"] / 2, lo["z0"] + p["W"] / 2)
    return g.ext_xz(poly, lo["y_glass"] - 0.05, lo["y_glass"] + 0.2)


def lenses(lo):
    """The back camera's features that stick out (lens rings, flash, laser autofocus)."""
    p = lo["p"]
    yb = lo["y_glass"] + p["T"]
    out = []
    for x, y, d, h in p["camera"]:
        u, v = g.back_uv(p, x, y)
        X, Z = g.uv_to_xz(lo, u, v)
        out.append(g.cyl_y(X, Z, yb - 0.5, yb + h, d, sections=48))
    return out


def lenses_only(lo):
    """The camera's lens rings alone (to show where they go in the insert)."""
    return g.U(lenses(lo))


def keys(lo):
    """Volume and power keys: on the right edge in portrait, so on the top edge here."""
    p = lo["p"]
    ym = lo["y_glass"] + p["T"] / 2
    out = []
    for a, b in p["keys"]:
        x0, z = g.uv_to_xz(lo, a, p["W"])
        x1, _ = g.uv_to_xz(lo, b, p["W"])
        out.append(g.slab(x0, x1, ym - 1.25, ym + 1.25, z - 0.5, z + p["key_h"]))
    return out


def case(lo):
    """A thin case: shell around the phone with a lip in front of the screen's edge, and a ring around the camera
    (cam_lip above its back). None without a case."""
    c = lo["case"]
    if c["side"] <= 0:
        return None
    p = lo["p"]
    cx, cz = lo["x0"] + p["L"] / 2, lo["z0"] + p["W"] / 2
    outer = g.ext_xz(g.rrect(lo["Lc"], lo["Wc"], p["R"] + c["side"], cx, cz), lo["y_front"], lo["y_pb"])
    window = g.ext_xz(g.rrect(p["L"] - 3.0, p["W"] - 3.0, p["R"] - 1.5, cx, cz), lo["y_front"] - 1, lo["y_glass"] + 0.5)
    feats = [(s, h) for s, h in lo["cam"]]
    lens_shapes = [s for s, h in feats[:-1] if h > 1.0]
    cut = unary_union([s.buffer(0.6, quad_segs=12) for s in lens_shapes]).convex_hull
    rim = unary_union([s.buffer(c["cam_rim"], quad_segs=12) for s in lens_shapes]).convex_hull
    cut_xz, rim_xz = g.shape_to_xz(lo, cut), g.shape_to_xz(lo, rim)
    lip = g.ext_xz(rim_xz, lo["y_pb"] - 0.5, lo["y_pb"] + c["cam_lip"])
    shell = g.D(g.U([outer, lip]), body(lo), window, g.ext_xz(cut_xz, lo["y_pb"] - c["back"] - 1, lo["y_pb"] + c["cam_lip"] + 1))
    return shell


def phone(lo):
    """Everything of the phone (and its case) that may touch the insert."""
    out = {"phone body": body(lo), "camera": g.U(lenses(lo)), "keys": g.U(keys(lo))}
    cs = case(lo)
    if cs is not None:
        out["case"] = cs
    return out


def puck(lo, u=None):
    """The round charger at u (phone frame, its centre) with the stiff boot of its cable, pointing right."""
    p = lo["p"]
    u = lo["puck_u"][0] if u is None else u
    X, Z = g.uv_to_xz(lo, u, p["W"] / 2)
    y0, y1 = lo["puck_y"]
    disc = g.cyl_y(X, Z, y0, y1, g.PUCK_D, sections=96)
    bd, bl = g.PUCK_RELIEF
    ym = (y0 + y1) / 2
    boot = g.cyl(0, 0, 0, bl, bd, sections=24)
    boot.apply_transform(np.array([[0, 0, 1, X + g.PUCK_D / 2 - 1.0], [0, 1, 0, ym], [-1, 0, 0, Z], [0, 0, 0, 1]], float))
    return disc, boot


def puck_tape(lo, u=None):
    """The 0.5 mm foam under the charger (a ring: the pocket's hole stays free)."""
    p = lo["p"]
    u = lo["puck_u"][0] if u is None else u
    X, Z = g.uv_to_xz(lo, u, p["W"] / 2)
    y = lo["puck_y"][1]
    return g.D(g.cyl_y(X, Z, y, y + g.PUCK_TAPE, g.PUCK_D - 4.0, sections=96), g.cyl_y(X, Z, y - 1, y + g.PUCK_TAPE + 1, g.PUCK_BACK_HOLE + 6.0, sections=48))


def puck_cable_path(lo, u=None):
    """The charger's cable: out of its boot to the right, back through the insert's exit, down inside the CRT back
    and out through its rear notch (for the pictures and the length)."""
    p = lo["p"]
    u = lo["puck_u"][0] if u is None else u
    X, Z = g.uv_to_xz(lo, u, p["W"] / 2)
    y0, y1 = lo["puck_y"]
    ym = (y0 + y1) / 2
    x_boot = X + g.PUCK_D / 2 - 1.0 + g.PUCK_RELIEF[1]
    e0, e1 = g.exit_u(lo)
    xe, _ = g.uv_to_xz(lo, (e0 + e1) / 2, 0)
    xe = max(xe, x_boot + 4.0)
    yr = g.BEZ_D + g.HOOD_D
    return [(x_boot, ym, Z), (xe, ym + 1.0, Z), (xe + 2.0, g.INSERT_D + 3.0, Z - 2.0), (xe - 10.0, g.BEZ_D + 14.0, Z - 25.0),
            (20.0, yr - 14.0, 12.0), (0.0, yr - 4.0, 3.5), (0.0, yr + 12.0, 3.5)]


def usb_plug(lo):
    """A straight USB-C plug in the phone's port (right end), and the first bit of its cable."""
    p = lo["p"]
    w, t, length = USB_PLUG
    X, Z = g.uv_to_xz(lo, p["L"], p["usb_v"])
    ym = lo["y_glass"] + p["T"] / 2
    x0 = X + lo["case"]["side"] + 0.2
    plug = g.slab(x0, x0 + length, ym - t / 2, ym + t / 2, Z - w / 2, Z + w / 2)
    cable = g.cyl(0, 0, 0, 25.0, USB_CABLE_D, sections=20)
    cable.apply_transform(np.array([[0, 0, 1, x0 + length - 0.5], [0, 1, 0, ym], [-1, 0, 0, Z], [0, 0, 0, 1]], float))
    return plug, cable


def mass_points(lo, with_puck=True):
    """(grams, centre) of the phone, its case and the charger."""
    p = lo["p"]
    c = phone_uvw(lo, p["L"] / 2, p["W"] / 2, p["T"] / 2)
    out = [(p["mass"], c)]
    if lo["case"]["side"] > 0:
        out.append((30.0, c))
    if with_puck:
        X, Z = g.uv_to_xz(lo, lo["puck_u"][0], p["W"] / 2)
        out.append((g.PUCK_MASS, np.array([X, sum(lo["puck_y"]) / 2, Z])))
    return out
