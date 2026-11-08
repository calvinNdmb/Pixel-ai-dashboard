"""Pixel: every check on the 3D model, for v1 (default) and v2 (V2_PANEL = True).

    python3 tools/verify.py            # both versions, about 2 minutes
    python3 tools/verify.py --v1       # only v1 (what generate.py exports by default)

Checks: collisions between the printed parts and with the bought parts (the blue-board screen and everything on
its back, both ways up; Pi 4 with its plugs; Stream Deck module / keys / USB-C plug; option tray; v2 front-panel
parts and LED strip), screen mounting (glass pocket and centring ribs, window, lip, the CRT back's 4 posts on the
brass rings, the back screwed on the bezel, free depth behind the PCB, optional tape) in the monitor and in
ScreenMountTest, ScreenPostTest, ribbon slot and cable lengths,
Stream Deck fit test (same windows, margins and pocket as the real keyboard), print checks (build volume, mesh health, overhangs, thin walls), filament, stability.
Exit code 0 when every check passes.
"""
import argparse
import sys
import time
import warnings

import numpy as np
import shapely
import shapely.ops

import checks
import mocks

g = mocks.g
warnings.filterwarnings("ignore")
np.seterr(all="ignore")

FAILS = []
# Intentionally thin features, with the reason (they are reported, not failed)
THIN_OK = {"PixelKeyboardLeds": "the translucent LED bar is 0.8 mm thick on purpose (light guide)"}

# bought parts, for the stability estimate (grams)
SCREEN_G, PI_G, SD_MODULE_G, CABLES_G = 250.0, 70.0, 120.0, 40.0   # screen [measure]


def check(ok, label, detail=""):
    print(("  OK    " if ok else "  FAIL  ") + label + (f"  [{detail}]" if detail else ""))
    if not ok:
        FAILS.append(label)
    return ok


def ov(a, b):
    if not (np.all(a.bounds[0] < b.bounds[1]) and np.all(a.bounds[1] > b.bounds[0])):
        return 0.0
    return round(abs(a.intersection(b, engine="manifold").volume), 3)


def no_overlap(group_a, group_b, label, skip=()):
    bad = []
    for ka, a in group_a.items():
        for kb, b in group_b.items():
            if ka == kb or (ka, kb) in skip or (kb, ka) in skip:
                continue
            v = ov(a, b)
            if v > 0.01:
                bad.append(f"{ka} x {kb}: {v} mm3")
    check(not bad, label, "; ".join(bad[:6]))
    return bad


def print_minutes(m, flow=10.0, layer=0.2, per_layer=4.0, start=4.0):
    """Rough print time on a Bambu Lab P2S (minutes): the extruded volume at a modest average flow (mm3/s, small
    parts are mostly walls), a few seconds per layer change, and the start sequence (heating, levelling)."""
    v = g.filament_g(m) / 1.24 * 1000.0
    return v / flow / 60.0 + m.extents[2] / layer * per_layer / 60.0 + start


def section(m, w):
    """Material of a mesh at height w (a Z section), as one shapely geometry."""
    from shapely.ops import unary_union
    return unary_union(checks._section_polys(m, np.array([0.0, 0.0, w]), np.array([0.0, 0.0, 1.0]))[0])


def sd_fit_test(asm, prn):
    """StreamDeckFitTest against the real keyboard, all in the keyboard's local frame (w = 0 under the top plate)."""
    to_local = np.linalg.inv(g.kb_frame())
    loc = lambda m: m.copy().apply_transform(to_local)                                    # noqa: E731
    test = g.build_sd_fit_test()
    top, base = loc(asm["PixelKeyboardTop"]), loc(asm["PixelKeyboardBase"])
    body, keys, _, _ = mocks.sd_module()
    body, keys = loc(body), [loc(k) for k in keys]
    check(ov(body, test) + sum(ov(k, test) for k in keys) < 0.01, "Stream Deck fit test vs module body and 15 keys")
    # key windows: same outline as the real top inside the test's footprint, so the same margins around each key
    w = g.KB_TOP_T / 2
    t_sec, r_sec = section(test, w), section(top, w)
    foot = shapely.geometry.Polygon(max(t_sec.geoms, key=lambda q: q.area).exterior) if hasattr(t_sec, "geoms") \
        else shapely.geometry.Polygon(t_sec.exterior)
    diff = t_sec.symmetric_difference(r_sec.intersection(foot)).area
    k_secs = [section(k, w) for k in keys]
    m_test = [ks.distance(t_sec) for ks in k_secs]
    m_real = [ks.distance(r_sec) for ks in k_secs]
    check(diff < 0.5 and max(abs(a - b) for a, b in zip(m_test, m_real)) < 0.01 and min(m_test) > 0.2,
          "fit test: the 15 key windows are the real keyboard top's, with the same margins around the keys",
          f"{len(g.kb_key_windows())} windows, outline difference {diff:.2f} mm2, key margin {min(m_test):.3f} mm "
          f"(real top {min(m_real):.3f} mm, KEY_CUT {g.KEY_CUT} mm), keys stick out {max(k.bounds[1][2] for k in keys) - g.KB_TOP_T:.1f} mm")
    # module pocket: same side clearance as the base, rim down to the base's ledge
    wm = -g.MOD_T / 2
    b_sec, bt_sec = section(body, wm), section(test, wm)
    c_test, c_base = b_sec.distance(bt_sec), b_sec.distance(section(base, wm))
    u0, u1, v0, v1 = g.mod_pocket()
    vm = (v0 + v1) / 2
    ledge = g.slab(u0 + 0.5, u0 + g.MOD_LEDGE - 0.5, vm - 5, vm + 5, -g.MOD_DEPTH - 0.5, -g.MOD_DEPTH - 0.1)
    above = g.slab(u0 + 0.5, u0 + g.MOD_LEDGE - 0.5, vm - 5, vm + 5, -g.MOD_DEPTH + 0.1, -g.MOD_DEPTH + 0.5)
    ledge_ok = ov(ledge, base) / ledge.volume > 0.95 and ov(above, base) < 0.01
    check(abs(c_test - c_base) < 0.01 and abs(test.bounds[0][2] + g.MOD_DEPTH) < 0.01 and ledge_ok,
          "fit test: module pocket like the base's, rim down to the ledge",
          f"side clearance {c_test:.2f} mm (base {c_base:.2f} mm, MOD_CLR), rim {g.MOD_DEPTH:.1f} mm deep (MOD_DEPTH): "
          f"the module's back sits {g.MOD_DEPTH - g.MOD_T:.1f} mm inside its edge, the foam's room")
    m = prn["StreamDeckFitTest"]
    grams, mins = g.filament_g(m), print_minutes(m)
    check(grams < 25.0 and mins < 60.0 and m.extents[2] < 15.0, "fit test is a quick print",
          f"{m.extents[0]:.1f} x {m.extents[1]:.1f} x {m.extents[2]:.1f} mm, ~{grams:.0f} g, about {mins:.0f} min on the P2S")


def section_y(m, y):
    """Material of a mesh in the plane Y = y, as one shapely geometry in (X, Z)."""
    polys = checks._section_polys(m, np.array([0.0, y, 0.0]), np.array([0.0, 1.0, 0.0]))[0]
    return shapely.ops.unary_union([shapely.ops.transform(lambda a, b: (b, a), p) for p in polys])   # (Z, X) -> (X, Z)


def holes_of(geom):
    return [shapely.geometry.Polygon(i) for q in getattr(geom, "geoms", [geom]) for i in q.interiors]


def eq_d(poly):
    return 2 * (poly.area / np.pi) ** 0.5


def pictures():
    """The picture's outline in the 4 ways the screen can go in (as measured, turned 180 deg, mirrored both ways)."""
    out = {}
    for sx, sz, name in ((1, 1, "as measured"), (-1, -1, "turned 180 deg"), (-1, 1, "mirrored L/R"), (1, -1, "mirrored U/D")):
        x, z = sx * g.PIC_DX, sz * g.PIC_DZ
        out[name] = shapely.geometry.box(x - g.PIC_W / 2, z - g.PIC_H / 2, x + g.PIC_W / 2, z + g.PIC_H / 2)
    return out


def win_ok(lip, label):
    """The window (biggest hole in a lip section, glass-centre coordinates) is centred, at least WIN_MIN, shows the
    whole picture in all 4 orientations with a margin, and the lip all around covers >= LIP_MIN of the glass."""
    hole = max(holes_of(lip), key=lambda q: q.area)
    hx0, hz0, hx1, hz1 = hole.bounds
    cxh, czh = (hx0 + hx1) / 2, (hz0 + hz1) / 2
    margins = {}
    for k, pic in pictures().items():
        inside = hole.contains(pic)
        margins[k] = min(hole.exterior.distance(shapely.geometry.Point(p)) for p in pic.exterior.coords) if inside else -1.0
    edge = min(min(hx1 - p.bounds[2], p.bounds[0] - hx0, hz1 - p.bounds[3], p.bounds[1] - hz0) for p in pictures().values())
    check(min(margins.values()) >= 0.5 and abs(cxh) < 0.05 and abs(czh) < 0.05
          and hx1 - hx0 >= g.WIN_MIN[0] - 0.05 and hz1 - hz0 >= g.WIN_MIN[1] - 0.05,
          f"{label}: the window shows the whole picture, whichever way the screen goes in",
          f"window {hx1 - hx0:.1f} x {hz1 - hz0:.1f} mm centred (at least {g.WIN_MIN[0]} x {g.WIN_MIN[1]}); picture "
          f"{g.PIC_W:.1f} x {g.PIC_H:.1f} mm, off-centre by {g.PIC_DX:+.1f} / {g.PIC_DZ:+.1f} mm (black border "
          f"{g.SCR_BORDER['left']:.0f} left, {g.SCR_BORDER['right']:.0f} right, {g.SCR_BORDER['top']:.0f} top, "
          f"{g.SCR_BORDER['bottom']:.0f} bottom); margin at least {edge:.1f} mm on the edges, {min(margins.values()):.1f} mm "
          f"at the rounded corners, in the 4 orientations")
    glass = shapely.geometry.box(-g.SCR_W / 2, -g.SCR_H / 2, g.SCR_W / 2, g.SCR_H / 2)
    ring_ = glass.difference(hole)
    lip_x, lip_z = (g.SCR_W - (hx1 - hx0)) / 2, (g.SCR_H - (hz1 - hz0)) / 2
    check(min(lip_x, lip_z) >= g.LIP_MIN - 0.03 and ring_.geom_type == "Polygon" and len(ring_.interiors) == 1,
          f"{label}: a continuous lip covers the glass's black border all around",
          f"{lip_x:.1f} mm sides, {lip_z:.1f} mm top/bottom (LIP_MIN {g.LIP_MIN}); the back's posts hold the glass on it")


def screen_mount(parts, holder, y_lip, label, cx=0.0, cz=0.0, posts=None):
    """The blue-board screen in a holder (ScreenMountTest, or the real bezel + CRT back), both ways up: nothing
    printed touches the screen, its connectors, the ribbon's fold, its wires (or the optional tape); nothing printed
    in the free depth behind the PCB except the 4 posts at the corner rings (posts = the part that carries them);
    the ribs centre the glass; the pocket is the fit test's; the optional tape stays on the black border."""
    yg = y_lip + g.TAPE_T
    tape = mocks.tape(cx, cz, y_lip) if g.TAPE_T > 0 else None
    skip = [("rings", posts)] if posts else []
    for flip in (False, True):
        scr = mocks.blue_screen(cx, cz, yg, flip)
        if tape is not None:
            scr["tape"] = tape
        no_overlap(scr, parts, f"{label}: screen (glass, PCB, brass rings, DSI connector + ribbon fold, power plug + "
                               f"wires, Backlight switch, Pi standoffs) vs printed parts, "
                               f"{'turned 180 deg' if flip else 'as on the photo'}", skip=skip)
    zone = mocks.scr_free_zone(cx, cz, yg)
    if posts:
        a = g.SCR_POST_D / 2 + 1.5
        cut = []
        for x, z in g.scr_holes(cx, cz):
            sx, sz = np.sign(x - cx), np.sign(z - cz)
            xs_, zs_ = sorted([x - sx * a, x + sx * 20]), sorted([z - sz * a, z + sz * 20])
            cut.append(g.slab(xs_[0], xs_[1], yg, yg + 100, zs_[0], zs_[1]))
        zone = g.D(zone, *cut)
    v = sum(ov(zone, m) for m in parts.values())
    check(v < 0.01, f"{label}: {g.SCR_BACK_FREE:.0f} mm free behind the PCB" + (" except at the 4 corner rings" if posts else ""),
          f"{v} mm3 in the zone")
    glass = shapely.geometry.box(-g.SCR_W / 2, -g.SCR_H / 2, g.SCR_W / 2, g.SCR_H / 2)
    if tape is not None:
        strips = [shapely.affinity.translate(t, -cx, -cz) for t in g.tape_strips(cx, cz)]
        pic = shapely.ops.unary_union(list(pictures().values()))
        win = shapely.geometry.box(g.VIEW_DX - g.WIN_W / 2, g.VIEW_DZ - g.WIN_H / 2, g.VIEW_DX + g.WIN_W / 2, g.VIEW_DZ + g.WIN_H / 2)
        lip = shapely.affinity.translate(section_y(holder, y_lip - 0.3), -cx, -cz)
        to_win = min(t.distance(win) for t in strips)
        on_lip = max(t.difference(lip).area for t in strips)
        inside = all(glass.buffer(-g.TAPE_EDGE + 0.01).contains(t) for t in strips)
        sw_, ew_ = g.tape_widths()
        check(inside and to_win >= g.TAPE_GAP - 0.01 and not any(t.intersects(pic) for t in strips) and on_lip < 0.01,
              f"{label}: the optional tape is on the black border only, with the lip behind it",
              f"{g.TAPE_T:.1f} mm tape (TAPE_T), strips {sw_:.1f} mm on the sides, {ew_:.1f} mm at the top and bottom")
    else:
        print(f"        {label}: no tape (TAPE_T = 0): the glass sits directly on the lip")
    # ribs: the glass is centred, SCR_CLR - SCR_RIB all around
    sec = shapely.affinity.translate(section_y(holder, yg + 2.0), -cx, -cz)
    gap = glass.exterior.distance(sec)
    pocket = max(holes_of(sec), key=lambda q: q.area)
    x0, z0, x1, z1 = pocket.bounds
    pw, ph = g.scr_pocket()
    n_ribs = len(g.scr_ribs())
    check(abs((x1 - x0) - pw) < 0.05 and abs((z1 - z0) - ph) < 0.05 and 0.05 <= gap <= 0.3 and n_ribs == 8,
          f"{label}: the pocket centres the glass",
          f"{x1 - x0:.2f} x {z1 - z0:.2f} mm (glass + {g.SCR_CLR} mm, like the fit test), {n_ribs} ribs leave {gap:.2f} mm "
          f"to the glass")


def posts_ok(asm, prn):
    """The 4 posts of the CRT back on the 4 brass rings, with the back screwed on the bezel."""
    cx, cz = g.screen_box()
    bezel, back = asm["PixelMonitorFront"], asm["PixelMonitorBack"]
    yb = g.y_pcb_back()
    tip = yb + g.SCR_NUT_H
    c0, c1 = g.cup_y()
    # cups: coaxial with the rings, the right size, the ring fits inside with clearance
    sec = section_y(back, (c0 + c1) / 2)
    cups = []
    for x, z in g.scr_holes(cx, cz):
        near = [q for q in holes_of(sec) if q.centroid.distance(shapely.geometry.Point(x, z)) < 0.05]
        cups.append(eq_d(near[0]) if near else 0.0)
    rings = mocks.blue_screen(cx, cz, g.y_glass())["rings"]
    rad = (min(cups) - g.SCR_NUT_D) / 2
    check(len(cups) == 4 and min(cups) > g.SCR_CUP_D - 0.1 and max(cups) < g.SCR_CUP_D + 0.05 and rad >= 0.2,
          "4 posts: a cup on each brass ring (6 mm from the glass edges), coaxial",
          f"cups {np.mean(cups):.2f} mm (SCR_CUP_D) over {g.SCR_NUT_D:.1f} mm rings: {rad:.2f} mm all around")
    # squeeze: the cup's bottom against the ring's tip, the rim clear of the PCB
    face = section_y(back, c1 + 0.05)
    bottoms = sum(1 for x, z in g.scr_holes(cx, cz) if face.contains(shapely.geometry.Point(x, z)))
    squeeze = tip - c1
    rim_gap = c0 - yb
    v_ring = ov(rings, back)
    exp = sum(np.pi * (g.SCR_NUT_D / 2) ** 2 * squeeze for _ in range(4))
    check(bottoms == 4 and 0.1 <= squeeze <= 0.5 and rim_gap >= 0.8 and abs(v_ring - exp) / exp < 0.15,
          "the closed back presses the 4 rings: the glass is held on the lip",
          f"cup bottoms {squeeze:.1f} mm into the ring tips (SCR_SQUEEZE), rings {g.SCR_CUP_H:.1f} mm deep in their cups, cup rims {rim_gap:.1f} mm from the PCB; with the optional {g.TAKEUP_T:.0f} mm dot (TAKEUP_T) "
          f"it presses {squeeze + g.TAKEUP_T:.1f} mm into the dot")
    # the back's position: rim on the bezel's rear face, 4 screws into the bezel's tabs
    ys = g.back_screw_y()
    tabs_ok, holes_ok = [], []
    for x, ta, tb, top in g.back_tabs():
        probe = g.cyl(x, ys, ta + 0.2, tb - 0.2, g.PILOT - 0.2)
        tabs_ok.append(ov(probe, bezel) < 0.01)                    # the pilot is there
        ring_ = g.D(g.cyl(x, ys, ta + 0.5, tb - 0.5, g.PILOT + 2.0), g.cyl(x, ys, ta, tb, g.PILOT + 0.4))
        tabs_ok.append(ov(ring_, bezel) / ring_.volume > 0.95)     # with material around it
        wall = g.cyl(x, ys, tb + 0.6, g.MON_Z0 + g.BEZ_H, g.CLEAR - 0.2) if top else g.cyl(x, ys, g.MON_Z0 - 1, ta - 0.6, g.CLEAR - 0.2)
        holes_ok.append(ov(wall, back) < 0.01)                     # the back's clearance hole is coaxial
    play = (g.CLEAR - 2.5) / 2
    check(all(tabs_ok) and all(holes_ok) and play < squeeze and ov(back, bezel) < 0.01,
          "the back is screwed on the bezel: the posts cannot back off",
          f"2 screws from above, 2 from below, M2.5 x 8 into 4 tabs of the bezel; hole play {play:.2f} mm < squeeze "
          f"{squeeze:.1f} mm")
    # stiffness: posts with 2 ribs each, merged into the walls
    free_len = []
    for x, z in g.scr_holes(cx, cz):
        y = c0
        while y < g.MON_F + g.BEZ_D + g.BACK_D:
            s_ = section_y(back, y)
            p = shapely.geometry.Point(x, z)
            part = [q for q in getattr(s_, "geoms", [s_]) if q.buffer(0.01).contains(p)]
            if part and part[0].area > 200:                     # joined to the back's wall
                break
            y += 1.0
        free_len.append(y - c0)
    check(max(free_len) <= 12.0, "the posts are stiff: ribbed and joined to the back's walls",
          f"post {g.SCR_POST_D:.0f} mm with 2 ribs of {g.SCR_POST_RIB} mm, free over {max(free_len):.0f} mm only")
    pt = prn["ScreenPostTest"]
    cup_t = section(pt, pt.bounds[1][2] - g.SCR_CUP_H / 2)
    d_t = max(eq_d(q) for q in holes_of(cup_t))
    deep = section(pt, pt.bounds[1][2] - g.SCR_CUP_H - 0.1)
    check(abs(d_t - np.mean(cups)) < 0.05 and not holes_of(deep) and g.filament_g(pt) < 3.0,
          "post test: the same cup as the back's posts", f"{d_t:.2f} mm, {g.SCR_CUP_H} mm deep, ~{g.filament_g(pt):.0f} g, "
          f"about {print_minutes(pt):.0f} min")


def power_button_ok(asm):
    """The real 12 mm power button on the monitor's chin: the hole, hidden by the head; a front wall for its nut
    and a pocket behind it; the button and its wires clear of the screen (both ways up), the posts, the tabs and
    the stand; its wires are long enough with a Dupont extension."""
    bezel, back = asm["PixelMonitorFront"], asm["PixelMonitorBack"]
    x, z, yf, ye = g.mon_btn()
    f = g.MON_F
    sec = section_y(bezel, f + g.BTN_WALL / 2)
    near = [q for q in holes_of(sec) if q.distance(shapely.geometry.Point(x, z)) < 0.01]
    hole = near[0] if near else shapely.geometry.Polygon()
    fits = hole.contains(shapely.geometry.Point(x, z).buffer(g.BTN_HOLE / 2 - 0.05))
    hidden = shapely.geometry.Point(x, z).buffer(g.BTN_HEAD_D / 2 - 0.1).contains(hole)
    check(bool(near) and fits and hidden, "power button: a real 12.2 mm hole in the monitor's chin, hidden by the head",
          f"bottom right of the bezel, X {x:+.0f} mm, {g.MON_BTN_Z:.1f} mm above its bottom (MON_BTN_X, MON_BTN_Z), "
          f"{g.BTN_HOLE} mm (BTN_HOLE); engraved ring {g.BTN_HEAD_D + 1.6:.1f} to {g.BTN_HEAD_D + 3.0:.1f} mm around the head")
    ann = g.D(g.cyl_y(x, z, f + 0.8, yf - 0.05, g.BTN_NUT_D + 1.0), g.cyl_y(x, z, f - 1, yf + 1, g.BTN_HOLE + 0.6))
    room = g.cyl_y(x, z, yf + 0.05, f + g.BEZ_D + 1.0, g.BTN_NUT_D + 1.5)
    seat = ov(ann, bezel) / ann.volume
    bot = (z - g.BTN_POCKET_D / 2) - g.MON_Z0
    top = (g.screen_box()[1] - g.scr_pocket()[1] / 2) - (z + g.BTN_POCKET_D / 2)
    check(seat > 0.95 and ov(room, bezel) < 0.01 and min(bot, top) >= 2.0,
          "power button: a 2.4 mm front wall for its nut, and a pocket behind it",
          f"front wall {g.BTN_WALL} mm (BTN_WALL), pocket {g.BTN_POCKET_D:.0f} mm for the {g.BTN_NUT_D:.0f} mm nut; "
          f"{bot:.1f} mm of bezel under the pocket, {top:.1f} mm to the glass pocket")
    btn = mocks.power_button()
    others = {"bezel": bezel, "back": back, "stand": asm["PixelStand"], "case": asm["PixelCase"],
              **{f"ribbon/{k}": m for k, m in mocks.ribbon_bundle().items()}}
    for flip in (False, True):
        for k, m in mocks.monitor_screen(flip).items():
            others[f"screen{'*' if flip else ''}/{k}"] = m
    bad = []
    for k, m in btn.items():
        for o, mm in others.items():
            if k == "button_body" and o == "bezel":
                continue                                            # it goes through its hole
            if ov(m, mm) > 0.01:
                bad.append(f"{k} x {o}")
    check(not bad and ov(btn["button_body"], bezel) < 0.01, "power button (head, body, nut) and its 2 wires vs bezel, CRT back "
          "and its posts, tabs, stand, screen + connectors (both ways up), ribbon", "; ".join(bad))
    L = mocks.btn_wire_length()
    ext = 200.0
    check(L + 30.0 <= g.BTN_LEAD + ext, "power button wires: long enough with a 20 cm Dupont extension",
          f"path about {L:.0f} mm + 30 mm (button -> ribbon slot -> stand -> case -> Pi pins {g.BTN_PINS[0]} and "
          f"{g.BTN_PINS[1]}): the {g.BTN_LEAD / 10:.0f} cm leads + 20 cm Dupont wires joined by 2 Wago")


def mount_test(prn):
    """ScreenMountTest."""
    print("-- screen mount test")
    test = g.build_mount_test()
    screen_mount({"ScreenMountTest": test}, test, 0.0, "mount test")
    rim_top = g.TAPE_T + g.SCR_T + g.SMT_MARGIN
    a_in, a_out = section_y(test, rim_top - 0.05).area, section_y(test, rim_top + 0.05).area
    check(a_out < 0.01 * a_in and 0.3 <= g.SMT_MARGIN <= 0.5, "mount test: the rim stands just proud of the PCB's back",
          f"rim {rim_top:.1f} mm deep for tape + glass + PCB {g.TAPE_T + g.SCR_T:.1f} mm: the PCB sits {g.SMT_MARGIN:.1f} mm "
          f"under its edge (SMT_MARGIN)")
    win_ok(section_y(test, -g.SMT_LIP / 2), "mount test")
    m = prn["ScreenMountTest"]
    grams, mins = g.filament_g(m), print_minutes(m)
    check(grams < 30.0 and mins < 90.0, "mount test is a quick print",
          f"{m.extents[0]:.1f} x {m.extents[1]:.1f} x {m.extents[2]:.1f} mm, ~{grams:.0f} g, about {mins:.0f} min on the P2S")


def run(v2):
    g.V2_PANEL = v2
    tag = "v2" if v2 else "v1"
    print(f"\n================ Pixel {tag} (V2_PANEL = {v2})")
    t0 = time.time()
    slivers = []
    single = g.single

    def spy(mesh, name):                                     # generate.single keeps the main body: count what it drops
        pieces = mesh.split(only_watertight=False)
        slivers.extend(f"{name} {abs(p.volume):.3f} mm3" for p in pieces if abs(p.volume) <= 1.0)
        return single(mesh, name)

    g.single = spy
    try:
        asm, prn = g.build_all()
    finally:
        g.single = single
    print(f"  built {len(prn)} print files in {time.time() - t0:.1f} s: {', '.join(prn)}")
    check(not slivers, "no slivers: every part comes out of the booleans as one piece", "; ".join(slivers[:5]))
    check(("PixelKeyboardLeds" in prn) == v2, "PixelKeyboardLeds.stl exported only in v2", f"exported: {'PixelKeyboardLeds' in prn}")

    # ---------------------------------------------------------------- printed parts against each other
    print("-- collisions")
    names = list(asm)
    bad = []
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            v = ov(asm[a], asm[b])
            if v > 0.01:
                bad.append(f"{a} x {b}: {v}")
    check(not bad, f"no overlap between the {len(names)} assembled printed parts", "; ".join(bad))

    pis = mocks.pi_blocks()
    bad = [f"{k}: {ov(m, asm['PixelCase'])}/{ov(m, asm['PixelCaseBottom'])}" for k, m in pis.items()
           if max(ov(m, asm["PixelCase"]), ov(m, asm["PixelCaseBottom"])) > 0.01]
    check(not bad, "Pi 4 (ports, heatsink, SD card, GPIO, DSI) + plugs (Stream Deck, mic, USB-C, 4 Dupont) vs case / bottom",
          "; ".join(bad))
    spk = mocks.speaker()
    check(ov(spk, asm["PixelCase"]) < 0.01 and sum(ov(spk, m) for m in pis.values()) < 0.01,
          "40 mm speaker (v2) under its slots vs case / Pi")

    body, keys, conn, plug = mocks.sd_module()
    base, top = asm["PixelKeyboardBase"], asm["PixelKeyboardTop"]
    check(ov(body, base) + ov(body, top) < 0.01, "Stream Deck module body vs keyboard base / top")
    check(sum(ov(k, base) + ov(k, top) for k in keys) < 0.01, "15 keys vs keyboard base / top")
    check(ov(conn, base) + ov(plug, base) < 0.01, "module USB-C connector + 90 deg plug vs keyboard base")
    check(plug.bounds[0][2] > 0.5, "90 deg plug stays above the desk", f"lowest point {plug.bounds[0][2]:.1f} mm")
    sd_fit_test(asm, prn)
    mount_test(prn)
    deck_body, deck_plug, _ = mocks.deck()
    tray = g.build_tray()
    check(ov(deck_body, tray) + ov(deck_plug, tray) < 0.01, "option tray vs whole Stream Deck + 90 deg plug")
    check(ov(tray, asm["PixelCase"]) < 0.01, "option tray vs case")

    if v2:
        fp = mocks.front_parts()
        bad = []
        for k, m in fp.items():
            for other, mm in [("case", asm["PixelCase"]), ("kb base", base), ("kb top", top), ("speaker", spk)] + list(pis.items()):
                if ov(m, mm) > 0.01:
                    bad.append(f"{k} x {other}")
        for i, a in enumerate(list(fp)):
            for b in list(fp)[i + 1:]:
                if ov(fp[a], fp[b]) > 0.01:
                    bad.append(f"{a} x {b}")
        check(not bad, "v2 front parts (Turbo, RGB LED, 2 LED holders) vs case / keyboard / speaker / Pi / each other",
              "; ".join(bad))
        strip = mocks.kb_led_strip()
        bar = asm["PixelKeyboardLeds"]
        check(ov(strip, base) + ov(strip, top) + ov(strip, bar) < 0.01, "v2 LED strip vs keyboard base / top / bar")
        check(ov(bar, top) + ov(bar, base) < 0.01, "v2 translucent bar vs keyboard top / base")
        check(abs(prn["PixelKeyboardLeds"].bounds[0][2]) < 0.01, "v2 bar and top stay aligned in the print files")
    else:
        case = asm["PixelCase"]
        intact = []
        for (x, z), d in [(g.PWR_XZ, g.PWR_HOLE)] + g.front_panel_holes():
            probe = g.cyl_y(x, z, g.CASE_Y0 + 0.9, g.CASE_Y0 + g.WALL - 0.1, 1.6)
            intact.append(ov(probe, case) / probe.volume)
        check(min(intact) > 0.95, "v1 front panel: buttons and LEDs are engraved, the wall is whole behind them",
              f"wall kept {min(intact) * 100:.0f} %")
        tl = []
        for u in g.KB_LED_U:
            probe = g.kb_box(u - 1.0, u + 1.0, g.KB_LED_V - 0.5, g.KB_LED_V + 0.5, 0.1, g.KB_TOP_T - 0.7)
            tl.append(ov(probe, top) / probe.volume)
        check(min(tl) > 0.95, "v1 keyboard: the 3 LED marks are engraved, no windows")
        pocket_probe = g.kb_box(g.KB_LED_U[0] - 4.0, g.KB_LED_U[-1] + 4.0, g.KB_LED_V - 5.5, g.KB_LED_V + 5.5, -3.0, -0.6)
        check(ov(pocket_probe, base) / pocket_probe.volume > 0.95, "v1 keyboard base: no LED strip pocket")

    # ---------------------------------------------------------------- monitor
    print("-- monitor and screen")
    cx, cz = g.screen_box(); z0 = g.MON_Z0; f = g.MON_F; yg = g.y_glass()
    sw, sh = g.scr_pocket()
    bezel, mback = asm["PixelMonitorFront"], asm["PixelMonitorBack"]
    screen_mount({"PixelMonitorFront": bezel, "PixelMonitorBack": mback}, bezel, g.y_lip(), "monitor", cx, cz,
                 posts="PixelMonitorBack")
    posts_ok(asm, prn)
    power_button_ok(asm)
    win_ok(shapely.affinity.translate(section_y(bezel, g.y_lip() - 0.3), -cx, -cz), "bezel")
    walls = dict(sides=g.BEZ_WALL, top=g.BEZ_TOP, chin=g.SCR_BOTTOM - g.SCR_CLR)
    check(min(walls.values()) >= 3.0, "bezel walls around the glass pocket", ", ".join(f"{k} {v:.2f}" for k, v in walls.items()))
    inner_hw = g.BACK_FRONT_W / 2 - g.WALL; inner_top = z0 + g.BACK_FRONT_H - g.WALL
    gap_x = inner_hw - sw / 2; gap_z = inner_top - (cz + sh / 2)
    check(gap_x >= 0.5 and gap_z >= 0.5 and g.BACK_FRONT_W / 2 <= g.BEZ_W / 2 - 1.0,
          "the CRT back's opening clears the glass pocket and its rim sits on the bezel", f"{gap_x:.2f} / {gap_z:.2f} mm")
    zt = g.tongue_z()
    check(zt - (cz + sh / 2) >= 1.0 and z0 + g.BEZ_H - (zt + 2.0) >= 2.0, "tongue slots inside the bezel's top wall",
          f"{zt - (cz + sh / 2):.1f} mm under, {z0 + g.BEZ_H - zt - 2:.1f} mm over")
    no_screws = [k for k in list(prn) + list(asm) if "Bracket" in k or "Pilot" in k]
    check(not no_screws, "no screws, brackets or tape needed for the screen", ", ".join(no_screws))
    check("PixelScreenPowerAdapter" not in prn and "PixelScreenPowerAdapter" not in asm,
          "no faux Pi: the screen takes its 5 V from 2 Dupont wires on its white connector")

    # ---------------------------------------------------------------- ribbon slot and cable lengths
    print("-- cables")
    bundle = mocks.ribbon_bundle()
    no_overlap(bundle, {k: asm[k] for k in ("PixelCase", "PixelStand", "PixelMonitorBack", "PixelMonitorFront")},
               "DSI ribbon + 4 Dupont plugs (screen power, power button) pass through the slots (monitor floor, stand, case top)")
    yb = g.y_pcb_back()
    x0s, x1s, y0s, y1s = g.RIBBON_SLOT
    slot_top = np.array([(x0s + x1s) / 2, (y0s + y1s) / 2, z0 + 11.0])
    slot_bot = np.array([slot_top[0], slot_top[1], g.CASE_H - g.WALL - 1.0])
    pi_dsi = np.array([*g.pi_xy(3.1, 27.5), g.PLATE_T + g.PI_STANDOFF + 1.4 + 5.5])
    pi_pin = np.array([*g.pi_xy(*g.gpio_xy(g.SCR_PWR_PINS[0])), g.PLATE_T + g.PI_STANDOFF + 1.4 + 8.5 + g.DUPONT[1]])
    Ls, Lws = [], []
    for flip in (False, True):
        sp = mocks.scr_spots(flip)
        dx, dz, dw = sp["dsi"][0], sp["dsi"][1], sp["dsi"][2]
        p_conn = np.array([cx + dx - sp["k"] * dw / 2, yb + 1.5, cz + dz])
        p_fold = p_conn + [-sp["k"] * 8.0, 8.0, 0]
        # out of the connector, folded back, then down to the slot in the monitor's floor (folded at 45 deg on the
        # way: the 40 mm allowance covers the folds)
        path = [p_conn, p_fold, slot_top, slot_bot, pi_dsi]
        Ls.append(sum(np.linalg.norm(np.subtract(path[i + 1], path[i])) for i in range(len(path) - 1)))
        px_, pz_ = sp["pwr"][0], sp["pwr"][1]
        p_plug = np.array([cx + px_, yb + g.SCR_PWR[4], cz + pz_])
        low = z0 + g.WALL + 3.0
        wpath = [p_plug, [p_plug[0], p_plug[1] + 6, low], [slot_top[0], slot_top[1], low], slot_top + [0, 2, 0],
                 slot_bot + [0, 2, 0], pi_pin]
        Lws.append(sum(np.linalg.norm(np.subtract(wpath[i + 1], wpath[i])) for i in range(len(wpath) - 1)))
    L, Lw = max(Ls), max(Lws)
    check(L + 40.0 <= 300.0, "a 300 mm DSI ribbon is long enough (screen either way up)",
          f"path about {L:.0f} mm + 40 mm for the folds and connectors")
    check(Lw + 30.0 <= 400.0, "40 cm Dupont wires are long enough (white connector -> Pi pins 4 and 6)", f"path about {Lw:.0f} mm")

    # ---------------------------------------------------------------- print files
    print("-- print files (Bambu Lab P2S, 256 mm cube)")
    total = 0.0
    rows = []
    for name, m in prn.items():
        ok_fit, ext = checks.printer_fit(m)
        h = checks.mesh_health(m)
        healthy = h["watertight"] and h["winding"] and h["volume"] and h["bodies"] == 1 and h["degenerate"] == 0 and h["duplicate"] == 0
        oh = checks.overhangs(m)
        bad_oh = [r for r in oh if not r["ok"]]
        edges = []
        thin = checks.thin_walls(m, edges=edges)["z"]
        floors = checks.thin_floors(m)
        grams = g.filament_g(m)
        if name != "PixelStreamDeckTray":
            total += grams
        thin_txt = (f"thin walls in {len(thin)} layers (worst {thin[0][2]} mm2 at {thin[0][3][0]})" if thin else "no thin walls") + \
                   (f", thin floors {[(round(r['area'], 1), round(r['thickness'], 2)) for r in floors[:3]]}" if floors else ", no thin floors")
        thin_ok = (not thin and not floors) or name in THIN_OK
        widest = max([r["span"] for r in oh], default=0.0)
        check(ok_fit and healthy and not bad_oh and thin_ok,
              f"{name:24s} {ext[0]:5.1f} x {ext[1]:5.1f} x {ext[2]:5.1f} mm  ~{grams:4.0f} g",
              f"{'fits' if ok_fit else 'TOO BIG'}; {'clean mesh' if healthy else h}; "
              f"{len(oh)} overhangs, all bridges (widest span {widest:.1f} mm)" if not bad_oh else
              f"overhangs needing support: {[(round(r['area']), round(r['span'], 1), round(r['length'], 1), r['centre']) for r in bad_oh[:3]]}")
        if thin or floors:
            print(f"        {thin_txt}" + (f"  -> accepted: {THIN_OK[name]}" if name in THIN_OK else ""))
        if edges:
            print(f"        {len(edges)} thin edges on thick material (engraving ridges, knife edges, chamfers): "
                  f"up to {max(a for _, a in edges):.1f} mm2 per layer, cosmetic")
        rows.append((name, ext, grams))
    print(f"  filament for the {tag} set (without the option tray): ~{total:.0f} g")

    # ---------------------------------------------------------------- stability
    print("-- stability")
    masses = []
    for name, m in asm.items():
        masses.append((g.filament_g(m), m.center_mass))
    scr = mocks.monitor_screen()
    glass = scr["glass"]
    masses.append((SCREEN_G, (glass.center_mass + scr["pcb"].center_mass) / 2))
    masses.append((PI_G, mocks.pi_blocks(False)["board"].center_mass))
    masses.append((SD_MODULE_G, body.center_mass))
    masses.append((CABLES_G, np.array([0.0, g.CASE_Y0 + g.CASE_D / 2, 20.0])))
    M = sum(mm for mm, _ in masses)
    com = sum(mm * np.asarray(c) for mm, c in masses) / M
    y_axis = max(y for _, y in g.case_feet()) + 5.0          # rear rubber feet, back edge
    tips = {}
    for label, zp in (("top of the picture", g.view_centre()[1] + g.PIC_DZ + g.PIC_H / 2), ("top of the monitor", z0 + g.BEZ_H)):
        tips[label] = M / 1000 * 9.81 * (y_axis - com[1]) / zp
    check(com[1] < y_axis, "the centre of mass is in front of the rear feet",
          f"total ~{M:.0f} g, centre of mass Y {com[1]:.0f} mm, Z {com[2]:.0f} mm; rear feet at Y {y_axis:.0f} mm")
    check(min(tips.values()) > 2.5, "a finger push does not tip Pixel over backwards",
          "; ".join(f"{v:.1f} N at the {k}" for k, v in tips.items()) + " (a tap is about 1 N)")
    mon = [asm["PixelMonitorFront"], asm["PixelMonitorBack"], glass]
    print(f"        monitor depth {asm['PixelMonitorBack'].bounds[1][1] - asm['PixelMonitorFront'].bounds[0][1]:.0f} mm, "
          f"total height {max(m.bounds[1][2] for m in mon):.0f} mm, total width {max(m.extents[0] for m in asm.values()):.0f} mm")
    return dict(total=total, rows=rows, tips=tips, com=com, mass=M, ribbon=L, wires=Lw)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--v1", action="store_true", help="only check v1")
    args = ap.parse_args()
    t = time.time()
    run(False)
    if not args.v1:
        run(True)
    g.V2_PANEL = False
    print(f"\n{'ALL CHECKS PASSED' if not FAILS else str(len(FAILS)) + ' CHECK(S) FAILED: ' + '; '.join(FAILS)}"
          f"  ({time.time() - t:.0f} s)")
    sys.exit(1 if FAILS else 0)


if __name__ == "__main__":
    main()
