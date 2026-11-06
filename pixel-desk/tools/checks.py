"""Generic 3D-print checks on trimesh meshes, in print orientation (bed at z = 0).

    mesh_health(m)          watertight, consistent winding, one body, no degenerate faces
    printer_fit(m, bed)     fits the build volume
    overhangs(m)            down-facing regions steeper than 45 deg, with their bridge span
    thin_walls(m)           walls thinner than 1.2 mm in the print layers (Z sections)
    thin_floors(m)          floors / ceilings thinner than 1.2 mm (vertical rays)
"""
import numpy as np
import shapely
from shapely.geometry import MultiPolygon, Polygon
from shapely.ops import unary_union

P2S_BED = (256.0, 256.0, 256.0)                 # Bambu Lab P2S build volume


def mesh_health(m):
    with np.errstate(all="ignore"):
        bodies = len(m.split(only_watertight=False))
    tri = m.triangles
    area = np.linalg.norm(np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]), axis=1) / 2
    faces_sorted = np.sort(m.faces, axis=1)
    dup = len(faces_sorted) - len(np.unique(faces_sorted, axis=0))
    return dict(watertight=bool(m.is_watertight), winding=bool(m.is_winding_consistent), volume=bool(m.is_volume),
                bodies=bodies, degenerate=int((area < 1e-9).sum()), duplicate=int(dup), euler=int(m.euler_number))


def printer_fit(m, bed=P2S_BED, margin=3.0):
    ext = m.extents
    return bool(np.all(ext <= np.array(bed) - margin) and m.bounds[0][2] > -1e-6), ext


def _regions(m, mask):
    """Connected groups of the faces in mask (sharing an edge)."""
    idx = np.nonzero(mask)[0]
    if len(idx) == 0:
        return []
    sel = set(idx.tolist())
    adj = m.face_adjacency
    keep = np.array([a in sel and b in sel for a, b in adj], bool) if len(adj) else np.zeros(0, bool)
    import scipy.sparse as sp
    from scipy.sparse.csgraph import connected_components
    pos = {f: i for i, f in enumerate(idx)}
    pairs = adj[keep]
    rows = [pos[a] for a in pairs[:, 0]] if len(pairs) else []
    cols = [pos[b] for b in pairs[:, 1]] if len(pairs) else []
    graph = sp.coo_matrix((np.ones(len(rows)), (rows, cols)), shape=(len(idx), len(idx)))
    n, labels = connected_components(graph, directed=False)
    return [idx[labels == k] for k in range(n)]


def overhangs(m, angle=45.0, bed_tol=0.3, bridge_max=12.0, bridge_long=25.0, min_area=0.5):
    """Down-facing faces steeper than `angle` from vertical, above the bed. Each connected region gets the size of
    its footprint (span = narrow side, length = long side). It prints as a bridge (ok) if it is narrow
    (span <= bridge_max) or if even its long side is a short bridge (length <= bridge_long)."""
    nz = m.face_normals[:, 2]
    c = m.triangles_center
    low = m.triangles[:, :, 2].min(axis=1)
    mask = (nz < -np.cos(np.radians(angle)) - 1e-3) & (low > bed_tol)
    out = []
    for faces in _regions(m, mask):
        area = float(m.area_faces[faces].sum())
        if area < min_area:
            continue
        polys = [Polygon(t[:, :2]) for t in m.triangles[faces]]
        foot = unary_union([p.buffer(1e-4) for p in polys if p.area > 1e-9])
        if foot.is_empty:
            continue
        rect = foot.minimum_rotated_rectangle
        xy = np.array(rect.exterior.coords)[:4]
        sides = sorted([np.linalg.norm(xy[i] - xy[(i + 1) % 4]) for i in range(2)])
        # span = width of the widest unsupported strip: twice the radius of the biggest circle inside the footprint
        # (a groove all around a part is a ring 0.8 mm wide, not a 72 mm bridge)
        span = min(sides[0], 2.0 * shapely.maximum_inscribed_circle(foot, tolerance=0.02).length)
        out.append(dict(area=area, span=float(span), length=float(sides[1]), z=float(c[faces, 2].mean()),
                        centre=np.round(c[faces].mean(axis=0), 1).tolist(),
                        ok=bool(span <= bridge_max or sides[1] <= bridge_long), flat=bool(np.all(nz[faces] < -0.99))))
    return sorted(out, key=lambda r: -r["area"])


def thin_floors(m, min_t=1.2, min_area=1.0):
    """Horizontal features thinner than min_t: from every up-facing face, measure the material straight below it,
    down to the next down-facing face (a ray that leaves through a steep side face is a slanted edge, not a floor)."""
    up = np.nonzero(m.face_normals[:, 2] > 0.9)[0]
    if len(up) == 0:
        return []
    origins = m.triangles_center[up] - np.array([0, 0, 1e-3])
    dirs = np.tile([0.0, 0.0, -1.0], (len(up), 1))
    loc, ray_i, tri_i = m.ray.intersects_location(origins, dirs, multiple_hits=True)
    depth = np.full(len(up), np.inf)
    exit_nz = np.zeros(len(up))
    for p, i, f in zip(loc, ray_i, tri_i):
        d = origins[i, 2] - p[2] + 1e-3                            # measured from the face itself
        if 1.1e-3 < d < depth[i]:
            depth[i] = d
            exit_nz[i] = m.face_normals[f, 2]
    mask = np.zeros(len(m.faces), bool)
    mask[up[(depth < min_t - 1e-3) & (exit_nz < -0.5)]] = True
    out = []
    for faces in _regions(m, mask):
        area = float(m.area_faces[faces].sum())
        if area >= min_area:
            k = np.isin(up, faces)
            out.append(dict(area=area, thickness=float(depth[k].min()), centre=np.round(m.triangles_center[faces].mean(axis=0), 1).tolist()))
    return sorted(out, key=lambda r: -r["area"])


_AXES_2D = {0: [[0, 1, 0], [0, 0, 1], [1, 0, 0]], 1: [[0, 0, 1], [1, 0, 0], [0, 1, 0]], 2: [[1, 0, 0], [0, 1, 0], [0, 0, 1]]}


def _section_polys(m, origin, normal):
    """Section polygons in a frame shared by all sections along the same axis, and the matrix back to 3D."""
    k = int(np.argmax(np.abs(normal)))
    T = np.eye(4)
    T[:3, :3] = _AXES_2D[k]
    T[2, 3] = -float(origin[k])
    sec = m.section(plane_origin=origin, plane_normal=normal)
    if sec is None:
        return [], np.linalg.inv(T)
    try:
        pl, to3d = sec.to_planar(to_2D=T, check=False)
    except Exception:  # noqa: BLE001
        return [], np.linalg.inv(T)
    return [p for p in pl.polygons_full if p.is_valid and p.area > 1e-6], to3d


def _opened(polys, r):
    return unary_union([p.buffer(-r, quad_segs=4).buffer(r, quad_segs=4) for p in polys])


def thin_walls(m, min_wall=1.2, step=0.5, axes=("z",), min_piece=0.4, margin=0.25, edge_dz=1.0, edges=None):
    """Material narrower than min_wall in planar sections (default: the print layers, i.e. Z sections).
    Returns, per axis, the sections with thin pieces: (position, thin area mm2, biggest piece mm2, where).
    A thin piece that sits on thick material edge_dz above or below (a tapering knife edge, the ridges between
    engraved details, a chamfer) is not a thin wall: it goes to `edges` (a list) instead, if one is given.
    Pieces smaller than min_piece mm2 are ignored (sharp corners always lose a little area in this test)."""
    r = min_wall / 2.0
    res = {}
    lo, hi = m.bounds
    for ax in axes:
        k = "xyz".index(ax)
        normal = np.eye(3)[k]
        found = []
        cache = {}

        def opened_at(p):
            key = round(p, 3)
            if key not in cache:
                origin = np.zeros(3); origin[k] = p
                cache[key] = _opened(_section_polys(m, origin, normal)[0], r) if lo[k] < p < hi[k] else Polygon()
            return cache[key]

        for pos in np.arange(lo[k] + margin, hi[k] - margin + 1e-9, step):
            origin = np.zeros(3); origin[k] = pos
            polys, to3d = _section_polys(m, origin, normal)
            for poly in polys:
                opened = poly.buffer(-r, quad_segs=4).buffer(r, quad_segs=4)
                thin = poly.difference(opened.buffer(1e-3))
                pieces = list(thin.geoms) if isinstance(thin, MultiPolygon) else ([thin] if not thin.is_empty else [])
                big = []
                for p in pieces:
                    if p.area < min_piece:
                        continue
                    thick_near = unary_union([opened_at(pos + edge_dz), opened_at(pos - edge_dz)])
                    if p.difference(thick_near).area < 0.2 * p.area:
                        if edges is not None:
                            edges.append((round(float(pos), 2), round(p.area, 2)))
                        continue
                    big.append(p)
                if big:
                    where = [np.round((to3d @ np.array([*p.centroid.coords[0], 0.0, 1.0]))[:3], 1).tolist()
                             for p in sorted(big, key=lambda q: -q.area)[:3]]
                    found.append((round(float(pos), 2), round(sum(p.area for p in big), 2), round(max(p.area for p in big), 2), where))
        res[ax] = sorted(found, key=lambda f: -f[2])
    return res


def summary_thin(res, top=3):
    out = {}
    for ax, found in res.items():
        out[ax] = dict(sections=len(found), worst=found[:top])
    return out
