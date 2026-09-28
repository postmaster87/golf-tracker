# -*- coding: utf-8 -*-
"""Generate the Hole Overview's 18 hole pictures and the frames that place a
position on them.

Spec: docs/SPEC_hole-overview.md Section 4 (4.1 and 4.2). Python 3 + Pillow.

Inputs (all committed; local files only, no network):
  docs/course-map/veenker/basemap.png               USDA NAIP 2025 photo
  docs/course-map/veenker/basemap_true_extent.json  the extent the server
                                                    ACTUALLY returned (README
                                                    trap 2) - never frame.json
  js/data/geometry/veenker.js                       the generated course map

Outputs:
  img/veenker/hole-NN.webp            18 crops, WebP quality 80, 0.30 m per px
  js/data/geometry/veenker-frames.js  VEENKER_FRAMES

The frame of hole n: up is the hole line's first point to its green's
centroid (tee at the bottom, green at the top); inside it the hole line, the
green, the hole's tee boxes and tee points, and every vertex of a fairway,
bunker or compact water polygon within 60 m of the hole line; 25 m margin;
width at least half the height; slid sideways 1 m at a time until all four
corners are on the photo. A frame that cannot be brought onto the photo, or
that loses anything it must hold by sliding, fails the run (exit 1).

The plane maths are js/util/geo.js's, line for line (enuOffset at the
midpoint latitude, offsetPoint at the origin's), so a pixel this writes and
`framePx` in js/round/course-geometry.js agree.

    python tools/course-geometry/build_hole_images.py

Re-runnable and byte-stable on the same inputs and the same Pillow/libwebp.
"""
import hashlib
import io
import json
import math
import os
import sys

import PIL
from PIL import Image, features

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MAP = os.path.join(ROOT, 'docs', 'course-map', 'veenker')
BASEMAP = os.path.join(MAP, 'basemap.png')
EXTENT = os.path.join(MAP, 'basemap_true_extent.json')
GEOMETRY = os.path.join(ROOT, 'js', 'data', 'geometry', 'veenker.js')
IMG_DIR = os.path.join(ROOT, 'img', 'veenker')
OUT = os.path.join(ROOT, 'js', 'data', 'geometry', 'veenker-frames.js')

M_PER_PX = 0.30        # square pixels
MARGIN_M = 25          # on all four sides
NEAR_LINE_M = 60       # a fairway, bunker or pond vertex this near the hole line is kept in
MIN_ASPECT = 0.50      # width at least this share of height
COMPACT_SPAN_M = 150   # a pond, not the creek: course-geometry.js COMPACT_SPAN_M
SLIDE_STEP_M = 1
WEBP_QUALITY = 80

# ---------------------------------------------------------------- geo.js, in Python
A = 6378137.0
F = 1 / 298.257223563
E2 = F * (2 - F)
D2R = math.pi / 180


def radii_at(lat):
    s = math.sin(lat * D2R)
    t = 1 - E2 * s * s
    rt = math.sqrt(t)
    return (A * (1 - E2)) / (t * rt), A / rt


def enu_offset(a, b):
    """geo.js enuOffset: (east, north) metres from a to b, radii at the midpoint latitude."""
    lat0 = (a['lat'] + b['lat']) / 2
    M, N = radii_at(lat0)
    return N * math.cos(lat0 * D2R) * (b['lon'] - a['lon']) * D2R, M * (b['lat'] - a['lat']) * D2R


def offset_point(a, east, north):
    """geo.js offsetPoint: step east/north metres from a, radii at a's latitude."""
    M, N = radii_at(a['lat'])
    return {'lat': a['lat'] + (north / M) * (180 / math.pi),
            'lon': a['lon'] + (east / (N * math.cos(a['lat'] * D2R))) * (180 / math.pi)}


def ring_centroid(ring):
    """polygon.js ringCentroid: area-weighted in ring[0]'s plane, back to lat/lon."""
    o = ring[0]
    P = [enu_offset(o, q) for q in ring]
    a = cx = cy = 0.0
    for i in range(len(P) - 1):
        (x1, y1), (x2, y2) = P[i], P[i + 1]
        c = x1 * y2 - x2 * y1
        a += c
        cx += (x1 + x2) * c
        cy += (y1 + y2) * c
    if abs(a) < 1e-9:
        pts = ring[:-1] if ring[0] == ring[-1] else ring
        return {'lat': sum(q['lat'] for q in pts) / len(pts), 'lon': sum(q['lon'] for q in pts) / len(pts)}
    return offset_point(o, cx / (3 * a), cy / (3 * a))


def distance_to_polyline(pt, line):
    """polygon.js distanceToPolyline, in pt's plane."""
    P = [enu_offset(pt, q) for q in line]
    best = math.inf
    for i in range(1, len(P)):
        (ax, ay), (bx, by) = P[i - 1], P[i]
        dx, dy = bx - ax, by - ay
        L = dx * dx + dy * dy
        t = 0 if L == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / L))
        best = min(best, math.hypot(ax + t * dx, ay + t * dy))
    return best


def ring_span_m(ring):
    """polygon.js ringSpanM: the diagonal of the east/north bounding box."""
    P = [enu_offset(ring[0], q) for q in ring]
    es = [p[0] for p in P]
    ns = [p[1] for p in P]
    return math.hypot(max(es) - min(es), max(ns) - min(ns))


def frame_px(fr, pos):
    """course-geometry.js framePx, the same formula (docs/SPEC_hole-overview.md 4.3)."""
    e, n = enu_offset(fr['origin'], pos)
    u = e * fr['up']['east'] + n * fr['up']['north']
    v = e * fr['up']['north'] - n * fr['up']['east']
    return (v - fr['v0M']) / fr['mPerPx'], fr['heightPx'] - (u - fr['u0M']) / fr['mPerPx']


# ------------------------------------------------------------------- inputs
def sha256(path):
    """A text input (.json, .js) is hashed with CRLF read as LF, so the recorded
    hash is the committed file's in any checkout; the photo is hashed as it is
    (docs/SPEC_hole-overview.md 14.2, R3)."""
    with open(path, 'rb') as f:
        data = f.read()
    if os.path.splitext(path)[1].lower() in ('.json', '.js'):
        data = data.replace(b'\r\n', b'\n')
    return hashlib.sha256(data).hexdigest()


def load_geometry():
    """The generated module is one JSON object per line (build_veenker.py writes it so)."""
    holes, polys, points, sec = [], [], [], None
    with open(GEOMETRY, encoding='utf-8') as f:
        for ln in f:
            s = ln.strip()
            if s.startswith('holes:'):
                sec = holes
            elif s.startswith('polygons:'):
                sec = polys
            elif s.startswith('points:'):
                sec = points
            elif s.startswith('{') and sec is not None:
                sec.append(json.loads(s.rstrip(',')))
    return holes, polys, points


failures = []
holes, polys, points = load_geometry()
if [h['number'] for h in holes] != list(range(1, 19)):
    print('FAIL: the geometry does not hold holes 1..18', file=sys.stderr)
    sys.exit(1)
by_id = {p['id']: p for p in polys}
with open(EXTENT, encoding='utf-8') as f:
    ext = json.load(f)
base = Image.open(BASEMAP)
base.load()
if base.mode != 'RGB':
    base = base.convert('RGB')
W, H = base.size
if (W, H) != (ext['width'], ext['height']):
    print(f"FAIL: basemap is {W} x {H}, the extent says {ext['width']} x {ext['height']}", file=sys.stderr)
    sys.exit(1)


def photo_px(ll):
    """lat/lon -> continuous basemap pixel coordinates (edges at 0 and W, 0 and H)."""
    return ((ll['lon'] - ext['xmin']) / (ext['xmax'] - ext['xmin']) * W,
            (ext['ymax'] - ll['lat']) / (ext['ymax'] - ext['ymin']) * H)


def on_photo(ll):
    return ext['xmin'] <= ll['lon'] <= ext['xmax'] and ext['ymin'] <= ll['lat'] <= ext['ymax']


# ------------------------------------------------------------------- frames
def must_hold(h):
    """Everything the frame of hole h must contain (4.1 'What must be inside')."""
    pts = list(h['line'])
    pts += by_id[h['greenId']]['ring']
    for tid in h['teeIds']:
        pts += by_id[tid]['ring']
    for p in points:
        if p.get('kind') == 'tee' and h['number'] in p.get('holes', []):
            pts.append({'lat': p['lat'], 'lon': p['lon']})
    for p in polys:
        k = p['kind']
        if k in ('fairway', 'bunker') or (k == 'water' and ring_span_m(p['ring']) <= COMPACT_SPAN_M):
            for r in [p['ring']] + p.get('inner', []):
                pts += [q for q in r if distance_to_polyline(q, h['line']) <= NEAR_LINE_M]
    return pts


def uv(fr, q):
    e, n = enu_offset(fr['origin'], q)
    return (e * fr['up']['east'] + n * fr['up']['north'], e * fr['up']['north'] - n * fr['up']['east'])


def corner_ll(fr, u, v):
    """(u along up, v along right) -> lat/lon; right = (up.north, -up.east)."""
    up = fr['up']
    return offset_point(fr['origin'], u * up['east'] + v * up['north'], u * up['north'] - v * up['east'])


def corners_on_photo(fr):
    u0, v0 = fr['u0M'], fr['v0M']
    u1, v1 = u0 + fr['heightPx'] * M_PER_PX, v0 + fr['widthPx'] * M_PER_PX
    return all(on_photo(corner_ll(fr, u, v)) for u in (u0, u1) for v in (v0, v1))


def frame_for(h):
    o = h['line'][0]
    C = ring_centroid(by_id[h['greenId']]['ring'])
    e, n = enu_offset(o, C)
    L = math.hypot(e, n)
    fr = {'origin': {'lat': o['lat'], 'lon': o['lon']},
          'up': {'east': round(e / L, 12), 'north': round(n / L, 12)}, 'mPerPx': M_PER_PX}
    held = [uv(fr, q) for q in must_hold(h)]
    u0 = min(u for u, _ in held) - MARGIN_M
    u1 = max(u for u, _ in held) + MARGIN_M
    v0 = min(v for _, v in held) - MARGIN_M
    v1 = max(v for _, v in held) + MARGIN_M
    if v1 - v0 < MIN_ASPECT * (u1 - u0):
        pad = (MIN_ASPECT * (u1 - u0) - (v1 - v0)) / 2
        v0 -= pad
        v1 += pad
    # Whole pixels, rounded UP so no margin comes out under 25 m.
    fr['widthPx'] = math.ceil((v1 - v0) / M_PER_PX - 1e-9)
    fr['heightPx'] = math.ceil((u1 - u0) / M_PER_PX - 1e-9)
    fr['u0M'] = round(u0, 3)
    fr['v0M'] = round(v0, 3)
    fr['slidM'] = 0
    if not corners_on_photo(fr):
        found = None
        for step in range(SLIDE_STEP_M, fr['widthPx'] + 1, SLIDE_STEP_M):
            for sgn in (1, -1):
                g = dict(fr, v0M=round(fr['v0M'] + sgn * step, 3), slidM=sgn * step)
                if corners_on_photo(g):
                    found = g
                    break
            if found:
                break
        if not found:
            failures.append(f"hole {h['number']}: no sideways slide puts the frame on the photo")
            return fr
        fr = found
    # Nothing it must hold may be lost by the slide.
    uu1 = fr['u0M'] + fr['heightPx'] * M_PER_PX
    vv1 = fr['v0M'] + fr['widthPx'] * M_PER_PX
    lost = [(u, v) for u, v in held if not (fr['u0M'] <= u <= uu1 and fr['v0M'] <= v <= vv1)]
    if lost:
        failures.append(f"hole {h['number']}: sliding {fr['slidM']} m loses {len(lost)} point(s) it must hold")
    fr['greenCentre'] = {'lat': round(C['lat'], 7), 'lon': round(C['lon'], 7)}
    return fr


def render(fr):
    """The crop, by one affine from output pixels to basemap pixels (all of it is linear)."""
    def src(x, y):
        return photo_px(corner_ll(fr, fr['u0M'] + (fr['heightPx'] - y) * M_PER_PX, fr['v0M'] + x * M_PER_PX))
    (x00, y00), (x10, y10), (x01, y01) = src(0, 0), src(1, 0), src(0, 1)
    coeffs = (x10 - x00, x01 - x00, x00, y10 - y00, y01 - y00, y00)
    img = base.transform((fr['widthPx'], fr['heightPx']), Image.AFFINE, coeffs, resample=Image.BICUBIC)
    # Self-check: framePx of the lat/lon the affine puts at each corner and the
    # centre gives that pixel back (offsetPoint vs enuOffset radii).
    worst = 0.0
    for x, y in ((0, 0), (fr['widthPx'], 0), (0, fr['heightPx']), (fr['widthPx'], fr['heightPx']),
                 (fr['widthPx'] / 2, fr['heightPx'] / 2)):
        ll = corner_ll(fr, fr['u0M'] + (fr['heightPx'] - y) * M_PER_PX, fr['v0M'] + x * M_PER_PX)
        px, py = frame_px(fr, ll)
        worst = max(worst, math.hypot(px - x, py - y))
    return img, worst


# -------------------------------------------------------------------- write
os.makedirs(IMG_DIR, exist_ok=True)
rows = []
total = 0
worst_all = 0.0
for h in holes:
    fr = frame_for(h)
    if failures:
        continue
    img, worst = render(fr)
    worst_all = max(worst_all, worst)
    buf = io.BytesIO()
    img.save(buf, 'WEBP', quality=WEBP_QUALITY, method=6)
    data = buf.getvalue()
    name = f"hole-{h['number']:02d}.webp"
    with open(os.path.join(IMG_DIR, name), 'wb') as f:
        f.write(data)
    total += len(data)
    control = []
    for cname, ll in (('lineStart', fr['origin']), ('greenCentre', fr['greenCentre'])):
        x, y = frame_px(fr, ll)
        control.append({'name': cname, 'lat': ll['lat'], 'lon': ll['lon'], 'x': round(x, 3), 'y': round(y, 3)})
    rows.append({
        'number': h['number'],
        'file': f'img/veenker/{name}',
        'widthPx': fr['widthPx'],
        'heightPx': fr['heightPx'],
        'mPerPx': M_PER_PX,
        'origin': fr['origin'],
        'up': fr['up'],
        'u0M': fr['u0M'],
        'v0M': fr['v0M'],
        'bytes': len(data),
        'sha256': hashlib.sha256(data).hexdigest(),
        'control': control,
        '_slid': fr['slidM'],
    })

if failures:
    for m in failures:
        print('FAIL:', m, file=sys.stderr)
    sys.exit(1)

print(f"Pillow {PIL.__version__}, libwebp {features.version('webp')}, WebP quality {WEBP_QUALITY}, {M_PER_PX} m per px")
print(f"{'hole':>4} {'px (w x h)':>12} {'frame m (w x h)':>16} {'up deg':>6} {'slid m':>6} {'bytes':>8}")
for r in rows:
    deg = (math.degrees(math.atan2(r['up']['east'], r['up']['north'])) + 360) % 360
    px = f"{r['widthPx']} x {r['heightPx']}"
    m = f"{r['widthPx'] * M_PER_PX:.1f} x {r['heightPx'] * M_PER_PX:.1f}"
    print(f"{r['number']:>4} {px:>12} {m:>16} {deg:>6.0f} {r['_slid']:>6} {r['bytes']:>8,}")
print(f"18 frames, {sum(1 for r in rows if r['_slid'])} slid; widths {min(r['widthPx'] for r in rows)} to "
      f"{max(r['widthPx'] for r in rows)} px, heights {min(r['heightPx'] for r in rows)} to "
      f"{max(r['heightPx'] for r in rows)} px; {min(r['bytes'] for r in rows):,} to {max(r['bytes'] for r in rows):,} bytes each")
print(f"TOTAL {total:,} bytes ({total / 1e6:.2f} MB); frame self-check worst {worst_all:.4f} px")

js = lambda v: json.dumps(v, separators=(',', ':'), ensure_ascii=False)
source = {
    'photo': 'USDA NAIP 2025, Iowa Geographic Map Server (public domain)',
    'generator': 'tools/course-geometry/build_hole_images.py',
    'inputsSha256': {'basemap': sha256(BASEMAP), 'extent': sha256(EXTENT), 'geometry': sha256(GEOMETRY)},
}
lines = [
    '/**',
    ' * GENERATED by tools/course-geometry/build_hole_images.py - do not edit by hand.',
    ' * Spec: docs/SPEC_hole-overview.md Section 4. Re-run the generator instead.',
    ' *',
    ' * One frame per hole for the Hole Overview picture: tee at the bottom, green at',
    ' * the top, 0.30 m per px. `framePx` in js/round/course-geometry.js places a',
    ' * position on it. Photo: USDA NAIP 2025 (public domain) via the Iowa Geographic',
    ' * Map Server, ISU GIS Support and Research Facility.',
    ' */',
    'export const VEENKER_FRAMES = {',
    "  courseId: 'veenker',",
    f'  source: {js(source)},',
    '  holes: [',
] + [f"    {js({k: v for k, v in r.items() if not k.startswith('_')})}," for r in rows] + [
    '  ],',
    '};',
    '',
]
text = '\n'.join(lines)
with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
    f.write(text)
print(f'wrote {os.path.relpath(OUT, ROOT)}: {len(text.encode("utf-8"))} bytes; 18 images in {os.path.relpath(IMG_DIR, ROOT)}')
