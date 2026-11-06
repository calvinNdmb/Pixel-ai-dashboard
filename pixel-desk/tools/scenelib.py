import sys
from math import cos, radians, sin
from pathlib import Path

import numpy as np
import trimesh
from PIL import Image, ImageDraw, ImageFont
from shapely import affinity
from shapely.geometry import Point, Polygon, box

# ---------------------------------------------------------------- geometry helpers
def slab(x0, x1, y0, y1, z0, z1):
    b = trimesh.creation.box(extents=[x1 - x0, y1 - y0, z1 - z0])
    b.apply_translation([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2])
    return b


def rslab(x0, x1, y0, y1, z0, z1, r):
    poly = box(x0, y0, x1, y1).buffer(-r).buffer(r, quad_segs=8)
    m = trimesh.creation.extrude_polygon(poly, z1 - z0)
    m.apply_translation([0, 0, z0])
    return m


def front_rounded(x0, x1, z0, z1, y_front, depth, r):
    """Box whose rounded corners are seen from the front (rounded in X-Z)."""
    poly = box(x0, z0, x1, z1).buffer(-r).buffer(r, quad_segs=10)
    m = trimesh.creation.extrude_polygon(poly, depth)
    # (a, b, c) -> (X, Y, Z) = (a, y_front + c, b): det = -1, so flip c instead
    m.apply_transform(np.array([[1, 0, 0, 0], [0, 0, -1, y_front + depth], [0, 1, 0, 0], [0, 0, 0, 1]], float))
    return m


def plate_front(poly_xz, y, t):
    """Thin plate drawn in (X, Z), lying on a plane that faces -Y, front at y - t."""
    m = trimesh.creation.extrude_polygon(poly_xz, t)
    m.apply_transform(np.array([[1, 0, 0, 0], [0, 0, -1, y], [0, 1, 0, 0], [0, 0, 0, 1]], float))
    return m


def cyl(x, y, z0, z1, r):
    c = trimesh.creation.cylinder(radius=r, height=z1 - z0, sections=40)
    c.apply_translation([x, y, (z0 + z1) / 2])
    return c


def tube(points, r, samples=160):
    """Smooth tube through control points (Catmull-Rom)."""
    P = np.asarray(points, float)
    P = np.vstack([P[0], P, P[-1]])
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for t in np.linspace(0, 1, max(4, samples // (len(P) - 3)), endpoint=False):
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(P[-2])
    path = np.array(out)
    keep = np.r_[True, np.linalg.norm(np.diff(path, axis=0), axis=1) > 1e-6]
    path = path[keep]
    circle = Point(0, 0).buffer(r, quad_segs=6)
    return trimesh.creation.sweep_polygon(circle, path)


# ---------------------------------------------------------------- renderer with projection
def basis(d, up):
    d = np.array(d, float); d /= np.linalg.norm(d)
    r = np.cross(d, up); r /= np.linalg.norm(r)
    return r, np.cross(r, d), d


def render(meshes, d, size=(1000, 900), pad=30, light=(0.35, -0.6, 0.75)):
    r, uu, dd = basis(d, (0, 0, 1))
    allv = np.concatenate([m.vertices for m, _ in meshes])
    px, py = allv @ r, allv @ uu
    lo = np.array([px.min(), py.min()]); hi = np.array([px.max(), py.max()])
    W, Hh = size
    scale = min((W - 2 * pad) / (hi[0] - lo[0]), (Hh - 2 * pad) / (hi[1] - lo[1]))
    offx = (W - (hi[0] - lo[0]) * scale) / 2; offy = (Hh - (hi[1] - lo[1]) * scale) / 2
    proj = lambda p: (((np.asarray(p) @ r) - lo[0]) * scale + offx, Hh - (((np.asarray(p) @ uu) - lo[1]) * scale + offy))
    zbuf = np.full((Hh, W), np.inf); img = np.ones((Hh, W, 3))
    L = np.array(light, float); L /= np.linalg.norm(L)
    for m, col in meshes:
        col = np.array(col, float)
        tri = m.triangles; nrm = m.face_normals
        shade = 0.45 + 0.55 * np.clip(nrm @ L, 0, 1) + 0.12 * np.clip(-(nrm @ dd), 0, 1)
        sx = (tri @ r - lo[0]) * scale + offx
        sy = Hh - ((tri @ uu - lo[1]) * scale + offy)
        sz = tri @ dd
        for i in range(len(tri)):
            x0, x1 = int(max(0, np.floor(sx[i].min()))), int(min(W - 1, np.ceil(sx[i].max())))
            y0, y1 = int(max(0, np.floor(sy[i].min()))), int(min(Hh - 1, np.ceil(sy[i].max())))
            if x1 < x0 or y1 < y0:
                continue
            X, Y = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
            (xa, xb, xc), (ya, yb, yc) = sx[i], sy[i]
            den = (yb - yc) * (xa - xc) + (xc - xb) * (ya - yc)
            if abs(den) < 1e-12:
                continue
            w1 = ((yb - yc) * (X - xc) + (xc - xb) * (Y - yc)) / den
            w2 = ((yc - ya) * (X - xc) + (xa - xc) * (Y - yc)) / den
            w3 = 1 - w1 - w2
            inside = (w1 >= -1e-6) & (w2 >= -1e-6) & (w3 >= -1e-6)
            if not inside.any():
                continue
            z = w1 * sz[i][0] + w2 * sz[i][1] + w3 * sz[i][2]
            sub = zbuf[y0:y1 + 1, x0:x1 + 1]
            upd = inside & (z < sub)
            sub[upd] = z[upd]
            img[y0:y1 + 1, x0:x1 + 1][upd] = np.clip(col * min(shade[i], 1.15), 0, 1)
    # soft outline from depth discontinuities
    zb = np.where(np.isinf(zbuf), zbuf[~np.isinf(zbuf)].max() + 50, zbuf)
    edge = (np.abs(np.diff(zb, axis=0, prepend=zb[:1])) > 6) | (np.abs(np.diff(zb, axis=1, prepend=zb[:, :1])) > 6)
    img[edge] *= 0.55
    return Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)), proj


FONT = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 22)
BOLD = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 26)


def label(img, proj, p3, text, dx, dy, color=(30, 30, 30)):
    d = ImageDraw.Draw(img)
    x, y = proj(p3)
    tx, ty = x + dx, y + dy
    d.line([x, y, tx, ty], fill=color, width=3)
    d.ellipse([x - 6, y - 6, x + 6, y + 6], fill=color)
    bb = d.multiline_textbbox((tx, ty), text, font=FONT, anchor="lm" if dx >= 0 else "rm")
    d.rectangle([bb[0] - 8, bb[1] - 6, bb[2] + 8, bb[3] + 6], fill=(255, 255, 255), outline=color, width=2)
    d.multiline_text((tx, ty), text, fill=(25, 25, 25), font=FONT, anchor="lm" if dx >= 0 else "rm")


