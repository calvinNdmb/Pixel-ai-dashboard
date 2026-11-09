"""Pixel Phone: every check on the 3D model.

    python3 tools/verify.py            # about 1 minute

Checks: the inserts in the bay (snug, they slide out to the front), the phone in each insert (bare and in a case:
seated on the bottom wall and the support, nothing touches the camera or the side keys), the Qi2 charger at both
ends of its slot (in its pocket, its face just behind the phone's back, clear of the camera, its cable in the groove
and out through the back), the USB-C cable option (90 deg plug), the bezel / CRT back / foot together (screws line
up, the back clears the foot), print checks (build volume, mesh health, overhangs, thin walls), filament, stability
(how hard a finger can push on the screen before Pixel Phone tips over).
Exit code 0 when every check passes. Uses the generic print checks of ../pixel-desk/tools/checks.py.
"""
import sys
import time
import warnings
from math import cos, radians, sin
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.append(str(HERE.parent.parent / "pixel-desk" / "tools"))
import mocks  # noqa: E402
import checks  # noqa: E402  (pixel-desk/tools/checks.py)

g = mocks.g
warnings.filterwarnings("ignore")
np.seterr(all="ignore")

FAILS = []


def check(ok, label, detail=""):
    print(("  OK    " if ok else "  FAIL  ") + label + (f"  [{detail}]" if detail else ""))
    if not ok:
        FAILS.append(label)
    return ok


def ov(a, b):
    if a is None or b is None:
        return 0.0
    if not (np.all(a.bounds[0] < b.bounds[1]) and np.all(a.bounds[1] > b.bounds[0])):
        return 0.0
    return round(abs(a.intersection(b, engine="manifold").volume), 3)


def mv(m, dx=0.0, dy=0.0, dz=0.0):
    m = m.copy(); m.apply_translation([dx, dy, dz]); return m


def print_minutes(m, flow=10.0, layer=0.2, per_layer=4.0, start=4.0):
    """Rough print time on a Bambu Lab P2S (minutes), as in pixel-desk/tools/verify.py."""
    v = g.filament_g(m) / 1.24 * 1000.0
    return v / flow / 60.0 + m.extents[2] / layer * per_layer / 60.0 + start


def usb90(lo):
    """Option: a 90 deg USB-C plug in the phone's port, its cable going back: head, boot, and the cable on through
    the insert's slot and the ledge's notch."""
    p, cs = lo["p"], lo["case"]["side"]
    X, Z = g.uv_to_xz(lo, p["L"], p["usb_v"])
    ym = lo["y_glass"] + p["T"] / 2
    x0 = X + cs + 0.2
    head = g.slab(x0, x0 + 12.0, ym - 3.4, ym + 3.4, Z - 6.25, Z + 6.25)
    xc = x0 + 6.5
    boot = g.cyl_y(xc, Z, ym + 3.4 - 0.1, ym + 3.4 + 8.0, 4.6)
    cable = g.cyl_y(xc, Z, ym + 3.4 + 7.9, g.BEZ_D + 6.0, mocks.USB_CABLE_D)
    return head, boot, cable


def insert_checks(name, ins, lo, front):
    print(f"-- {name}  ({'phone in a case' if lo['case']['side'] > 0 else 'bare phone'})")
    p = lo["p"]
    check(lo["rim_x"] >= g.RIM_MIN and lo["rim_z"] >= g.RIM_MIN, "the phone's well, funnel and rim fit in the bay",
          f"rim {lo['rim_x']:.2f} x {lo['rim_z']:.2f} mm (RIM_MIN {g.RIM_MIN}), well {lo['well_w']:.1f} x {lo['well_h']:.1f} mm")
    # the insert in the bay: snug on its crush ribs only, and it slides out to the front
    v_all = ov(ins, front)
    ribs = g.U(g.insert_ribs(lo))
    v_ribs = ov(ribs, front)
    rib_t = g.INSERT_RIB - g.INSERT_CLR
    check(abs(v_all - v_ribs) < 0.05 and 0.0 < rib_t <= 0.1, "insert in the bay: only its crush ribs touch the bay walls",
          f"{len(g.insert_ribs(lo))} ribs {rib_t:.2f} mm into the walls ({v_ribs:.1f} mm3 in all), {g.INSERT_CLR} mm elsewhere")
    out = max(ov(mv(ins, dy=-dy), front) for dy in (3.0, 10.0, g.INSERT_D * 0.6, g.INSERT_D + 1))
    check(out <= v_ribs + 0.05, "the insert slides out to the front (the bay is straight, nothing holds it back)")
    check(abs(ins.bounds[1][1] - g.INSERT_D) < 0.01 and abs(ins.bounds[0][1]) < 0.01,
          "insert flush with the bezel's face and resting on the ledge", f"{ins.bounds[0][1]:.2f} .. {ins.bounds[1][1]:.2f} mm")

    ph = mocks.phone(lo)
    bad = [f"{k}: {ov(m, ins)} mm3" for k, m in ph.items() if ov(m, ins) > 0.01]
    check(not bad, "phone in the insert: body, camera, side keys" + (" and case" if "case" in ph else "") + " clear of the insert",
          "; ".join(bad))
    outer = ph.get("case", ph["phone body"])
    seat = g.U([outer, ph["phone body"]])
    down, back = ov(mv(seat, dz=-0.15), ins), ov(mv(seat, dy=0.15), ins)
    check(down > 1.0 and back > 1.0, "the phone sits on the bottom wall and leans on the support (the monitor leans back)",
          f"0.15 mm lower: {down:.0f} mm3, 0.15 mm back: {back:.0f} mm3")
    # clearances all around the phone (the well, its corners)
    gaps = {}
    for k, (dx, dz) in {"left end": (-1, 0), "right end": (1, 0), "top": (0, 1)}.items():
        free = 0.0
        for step in np.arange(0.1, 3.0, 0.1):
            if ov(mv(seat, dx=dx * step, dz=dz * step), ins) > 0.01:
                break
            free = step
        gaps[k] = free
    check(min(gaps.values()) >= 0.5, "room around the phone in the well", ", ".join(f"{k} {v:.1f} mm" for k, v in gaps.items()))
    cam_grow = g.U([g.cyl_y(*g.uv_to_xz(lo, *g.back_uv(p, x, y)), lo["y_glass"] + p["T"] - 0.5,
                            lo["y_glass"] + p["T"] + h + 0.6, d + 1.2, sections=48) for x, y, d, h in p["camera"]])
    check(ov(cam_grow, ins) < 0.01, "camera: 0.6 mm or more of air all around the lenses (they hang in their pocket)")
    keys_grow = g.U([mv(k, dz=0.3) for k in mocks.keys(lo)])
    check(ov(keys_grow, ins) < 0.01, "side keys (top edge): not pressed, even 0.3 mm higher")
    g_front = lo["y_glass"] - g.FUNNEL
    check(0.0 <= g_front <= 1.5, "the screen sits just behind the funnel's edge", f"{g_front:.1f} mm behind (FUNNEL {g.FUNNEL} mm deep)")
    # screen fully visible: the funnel's edge (well outline) is outside the picture
    sw, sh = p["screen"]
    m_x = (lo["well_w"] - sw) / 2
    m_z = min(lo["z0"] + p["W"] / 2 - sh / 2 - lo["z_w0"], lo["z_w0"] + lo["well_h"] - (lo["z0"] + p["W"] / 2 + sh / 2))
    check(m_x > 0 and m_z > 0, "the whole picture is visible (nothing of the insert covers the screen)",
          f"well edge {m_x:.1f} mm outside the picture at the ends, {m_z:.1f} mm above / below")

    # the charger at both ends of its slot
    u0, u1 = lo["puck_u"]
    bad = []
    for u in (u0, u1):
        disc, boot = mocks.puck(lo, u)
        for nm, m in (("charger", disc), ("cable boot", boot)):
            if ov(m, ins) > 0.01:
                bad.append(f"{nm} at u={u:.0f}: {ov(m, ins)} mm3 in the insert")
            for k, pm in ph.items():
                if ov(m, pm) > 0.01:
                    bad.append(f"{nm} at u={u:.0f} x {k}: {ov(m, pm)} mm3")
    check(not bad, "Qi2 charger and its cable boot in the slot, at both ends, clear of the phone and its camera", "; ".join(bad))
    face_gap = lo["puck_y"][0] - lo["y_pb"]
    disc, _ = mocks.puck(lo, u0)
    tape = mocks.puck_tape(lo, u0)
    on_tape, tape_on_floor = ov(mv(disc, dy=0.15), tape), ov(mv(tape, dy=0.15), ins)
    check(abs(face_gap - g.PUCK_RECESS) < 1e-6 and on_tape > 1.0 and tape_on_floor > 1.0 and ov(tape, ins) < 0.01,
          "the charger's face is just behind the phone's back, stuck on 0.5 mm foam on the pocket's floor",
          f"{face_gap:.1f} mm of air to the phone (+ {lo['case']['back']:.1f} mm of case), {g.PUCK_BACK} mm of plastic behind it")
    vc = p["W"] / 2
    cam_d = min(g.Point(u0, vc).buffer(g.PUCK_D / 2, quad_segs=48).distance(s) for s, h in lo["cam"] if h > g.PUCK_RECESS + lo["case"]["back"])
    check(cam_d >= g.PUCK_CAM_GAP - 0.05, "the charger keeps clear of the camera, even pushed to the left end of its slot",
          f"{cam_d:.1f} mm (PUCK_CAM_GAP {g.PUCK_CAM_GAP}); slot centre u {u0:.1f} .. {u1:.1f} mm, coil at about {p['coil_u']:.0f} mm "
          f"[estimate]: {min(abs(u - p['coil_u']) for u in np.linspace(u0, u1, 25)):.1f} mm off at best")
    # cable: groove, exit through the back, inside the ledge's opening
    e0, e1 = g.exit_u(lo)
    xe0, ze = g.uv_to_xz(lo, e0, vc)
    xe1, _ = g.uv_to_xz(lo, e1, vc)
    probe = g.slab(xe0 + 1.0, xe1 - 1.0, g.INSERT_D - 1.0, g.BEZ_D + 1.0, ze - 2.0, ze + 2.0)
    check(ov(probe, front) < 0.01 and ov(probe, ins) < 0.01, "the charger's cable leaves through the insert's back into the CRT back",
          f"exit u {e0:.0f} .. {e1:.0f} mm, inside the ledge's opening")
    # USB-C option
    head, bootu, cable = usb90(lo)
    bad = [f"{k} x {n}: {ov(m, o)}" for k, m in (("head", head), ("boot", bootu), ("cable", cable))
           for n, o in (("insert", ins), ("bezel", front)) if ov(m, o) > 0.01]
    check(not bad, "option: a 90 deg USB-C plug fits in the right scoop, its cable goes back through the insert and the ledge",
          "; ".join(bad))
    return ph


def run():
    t0 = time.time()
    slivers = []
    single = g.single

    def spy(mesh, name):
        pieces = mesh.split(only_watertight=False)
        slivers.extend(f"{name} {abs(p.volume):.3f} mm3" for p in pieces if abs(p.volume) <= 1.0)
        return single(mesh, name)

    g.single = spy
    try:
        asm, inserts, prn = g.build_all()
    finally:
        g.single = single
    print(f"  built {len(prn)} print files in {time.time() - t0:.1f} s: {', '.join(prn)}")
    check(not slivers, "no slivers: every part comes out of the booleans as one piece", "; ".join(slivers[:5]))
    front, back, stand = asm["PixelPhoneFront"], asm["PixelPhoneBack"], asm["PixelPhoneStand"]

    # ---------------------------------------------------------------- monitor
    print("-- monitor")
    bad = [f"{a} x {b}: {ov(asm[a], asm[b])}" for a, b in (("PixelPhoneFront", "PixelPhoneBack"), ("PixelPhoneFront", "PixelPhoneStand"),
                                                         ("PixelPhoneBack", "PixelPhoneStand")) if ov(asm[a], asm[b]) > 0.01]
    check(not bad, "bezel, CRT back and foot do not overlap", "; ".join(bad))
    touch = ov(mv(back, dy=-0.15), front)
    check(touch > 1.0, "the CRT back's rim and posts sit against the bezel's back", f"{touch:.0f} mm3 when pushed 0.15 mm")
    # the 4 screws: through the bezel's ledge (heads under the insert) into the posts
    ok = True
    for x, z in g.screw_xz():
        shank = g.cyl_y(x, z, g.INSERT_D + g.CBORE_H + 0.05, g.INSERT_D + g.CBORE_H + 8.0 - 0.1, 2.0)    # M2.5 x 8
        head = g.cyl_y(x, z, g.INSERT_D + 0.05, g.INSERT_D + g.CBORE_H - 0.05, 4.6)
        in_post = ov(g.cyl_y(x, z, g.BEZ_D + 0.2, g.INSERT_D + g.CBORE_H + 8.0 - 0.1, 3.0), back)
        ok &= ov(shank, front) < 0.01 and ov(head, front) < 0.01 and in_post > 5.0
    bite = g.INSERT_D + g.CBORE_H + 8.0 - g.BEZ_D
    check(ok and bite >= 5.0, "4 screws M2.5 x 8 through the ledge (heads in their pockets, under the insert) into the posts",
          f"{bite:.1f} mm into each post")
    # foot: neck under the back's floor, 2 screws from inside the back
    yf = g.foot_screw_y()
    ok = all(ov(g.cyl(s * g.FOOT_SCREW_X, yf, -10.0 + 0.1, -0.1, 2.5), stand) > 3.0 and
             ov(g.cyl(s * g.FOOT_SCREW_X, yf, 0.1, g.WALL - 0.1, 2.0), back) < 0.01 for s in (-1, 1))
    touch = ov(mv(stand, dz=0.15), back)
    check(ok and touch > 1.0, "foot: its neck sits under the back's floor, 2 screws M2.5 x 12 from inside the back",
          f"{touch:.0f} mm3 when pushed 0.15 mm; screws 10 mm into the neck")
    sw = g.world(back)
    gap = 99.0
    st = g.build_stand()
    puck_top = g.cyl(0, g.FOOT_Y, g.STAND_H, g.STAND_H + 30, g.STAND_D)
    clipped = g.I(sw, puck_top)
    if len(clipped.faces):
        gap = clipped.bounds[0][2] - g.STAND_H
    check(gap >= 1.5, "the CRT back clears the foot's top as the monitor leans back", f"{gap:.1f} mm at its lowest")
    lows = {k: g.world(m).bounds[0][2] for k, m in asm.items() if k != "PixelPhoneStand"}
    check(min(lows.values()) > 5.0, "nothing but the foot touches the desk", f"lowest monitor point {min(lows.values()):.0f} mm up")

    ph = {}
    for name, (ins, lo) in inserts.items():
        ph[name] = insert_checks(name, ins, lo, front)
        bad = [f"{k}" for k, m in ph[name].items() if ov(m, front) > 0.01 or ov(m, back) > 0.01]
        check(not bad, "the phone touches nothing but its insert", ", ".join(bad))

    # ---------------------------------------------------------------- print files
    print("-- print files (Bambu Lab P2S, 256 mm cube)")
    total = 0.0
    for name, m in prn.items():
        ok_fit, ext = checks.printer_fit(m)
        h = checks.mesh_health(m)
        healthy = h["watertight"] and h["winding"] and h["volume"] and h["bodies"] == 1 and h["degenerate"] == 0 and h["duplicate"] == 0
        oh = checks.overhangs(m)
        bad_oh = [r for r in oh if not r["ok"]]
        edges = []
        thin = checks.thin_walls(m, edges=edges)["z"]
        floors = checks.thin_floors(m)
        grams, mins = g.filament_g(m), print_minutes(m)
        if "Test" not in name and "Coque" not in name:
            total += grams
        widest = max([r["span"] for r in oh], default=0.0)
        check(ok_fit and healthy and not bad_oh and not thin and not floors,
              f"{name:30s} {ext[0]:5.1f} x {ext[1]:5.1f} x {ext[2]:5.1f} mm  ~{grams:4.0f} g  ~{mins / 60:.1f} h",
              (f"{'fits' if ok_fit else 'TOO BIG'}; {'clean mesh' if healthy else h}; " +
               (f"{len(oh)} overhangs, all bridges (widest span {widest:.1f} mm)" if not bad_oh else
                f"overhangs needing support: {[(round(r['area']), round(r['span'], 1), round(r['length'], 1), r['centre']) for r in bad_oh[:3]]}") +
               (f"; thin walls in {len(thin)} layers {thin[:2]}" if thin else "") +
               (f"; thin floors {[(round(r['area'], 1), round(r['thickness'], 2), r['centre']) for r in floors[:3]]}" if floors else "")))
        if edges:
            print(f"        {len(edges)} thin edges on thick material (engraving ridges, chamfers): up to "
                  f"{max(a for _, a in edges):.1f} mm2 per layer, cosmetic")
    print(f"  filament for the monitor + one insert: ~{total:.0f} g (+ the tests)")

    # ---------------------------------------------------------------- stability
    print("-- stability (world frame: desk at z = 0, the monitor leans back)")
    ins, lo = inserts[g.insert_name()]
    parts = [(g.filament_g(m), g.world(m).center_mass) for m in (front, back, ins)] + [(g.filament_g(st), st.center_mass)]
    things = [(gr, (g.to_world() @ np.r_[c, 1.0])[:3]) for gr, c in mocks.mass_points(lo)]
    a = radians(g.TILT)
    push = np.array([0.0, cos(a), -sin(a)])                  # a finger pushes into the screen
    y_back, y_front = g.FOOT_Y + g.STAND_D / 2 - 3.0, g.FOOT_Y - g.STAND_D / 2 + 3.0     # tipping edges (chamfer)
    p = lo["p"]
    top_pic = (g.to_world() @ np.r_[mocks.phone_uvw(lo, p["L"] / 2, p["W"] / 2 + p["screen"][1] / 2, 0.0), 1.0])[:3]
    res = {}
    for label, ms in (("with the phone and the charger", parts + things), ("empty, charger only", parts + things[-1:])):
        M = sum(m for m, _ in ms)
        com = sum(m * np.asarray(c) for m, c in ms) / M
        Mg = M / 1000 * 9.81
        r = top_pic[1:] - np.array([y_back, 0.0])
        tau_push = r[0] * push[2] - r[1] * push[1]             # moment of a 1 N push about the back edge (X axis)
        f_back = Mg * (y_back - com[1]) / -tau_push if tau_push < 0 else float("inf")
        f_front = Mg * (com[1] - y_front) / (top_pic[2] - 0.0)  # a pull towards you, level, at the top of the picture
        res[label] = (M, com, f_back, f_front)
        print(f"        {label}: ~{M:.0f} g, centre of mass y {com[1]:.0f} mm (foot {y_front:.0f} .. {y_back:.0f} mm), z {com[2]:.0f} mm")
    M, com, f_back, f_front = res["with the phone and the charger"]
    check(y_front < com[1] < y_back, "the centre of mass is over the foot", f"y {com[1]:.0f} mm, foot {y_front:.0f} .. {y_back:.0f} mm")
    check(f_back >= 3.0, "a finger can push on the top of the screen: Pixel Phone does not tip backwards",
          f"it tips at {f_back:.1f} N (a tap is about 1 N)")
    check(f_front >= 1.5 and res["empty, charger only"][3] >= 1.5, "pulling the phone out does not tip it forwards",
          f"a level pull at the top of the screen tips it at {f_front:.1f} N (empty: {res['empty, charger only'][3]:.1f} N)")
    W = [g.world(m) for m in (front, back)] + [st]
    lo_, hi_ = np.min([m.bounds[0] for m in W], axis=0), np.max([m.bounds[1] for m in W], axis=0)
    print(f"        size on the desk: {hi_[0] - lo_[0]:.0f} mm wide, {hi_[1] - lo_[1]:.0f} mm deep, {hi_[2]:.0f} mm high; "
          f"screen's top {top_pic[2]:.0f} mm up, leaning back {g.TILT:.0f} deg")


def main():
    t = time.time()
    run()
    print(f"\n{'ALL CHECKS PASSED' if not FAILS else str(len(FAILS)) + ' CHECK(S) FAILED: ' + '; '.join(FAILS)}"
          f"  ({time.time() - t:.0f} s)")
    sys.exit(1 if FAILS else 0)


if __name__ == "__main__":
    main()
