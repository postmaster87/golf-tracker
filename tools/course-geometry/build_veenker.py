# -*- coding: utf-8 -*-
"""Generate js/data/geometry/veenker.js from the committed Veenker course map.

Spec: docs/SPEC_course-geometry.md Section 1. Standard library only.

Inputs (all committed, docs/course-map/veenker/):
  osm_full.json                      OSM golf features, the ground truth (his word)
  veenker_confirmed_corrections.json his confirmed corrections (hole 8, hole 9, hole 16)
  markup_lines.json + basemap_true_extent.json
                                     his tee-colour leader tips, converted with the
                                     TRUE extent by rematch.py's to_ll (reused, not
                                     re-derived)

Every assignment is a rule over geometry (Section 1.2). No course fact is typed
in here: if a rule does not produce what the corrections file says, the
generator fails and exits non-zero.

    python tools/course-geometry/build_veenker.py

Re-runnable and byte-stable on the same inputs.
"""
import contextlib
import hashlib
import io
import json
import math
import os
import runpy
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MAP = os.path.join(ROOT, 'docs', 'course-map', 'veenker')
OUT = os.path.join(ROOT, 'js', 'data', 'geometry', 'veenker.js')

# rematch.py's pixel -> lat/lon (true extent), planar metres, ring joining and
# point-in-ring. Run it quietly and take its functions; it prints a report.
with contextlib.redirect_stdout(io.StringIO()):
    RM = runpy.run_path(os.path.join(MAP, 'rematch.py'))
to_ll, xy, join_rings, in_ring, seg = RM['to_ll'], RM['xy'], RM['join_rings'], RM['in_ring'], RM['seg']
key_for, dist_m = RM['key_for'], RM['dist_m']

GREEN_CONTAIN_FALLBACK_M = 30
TEE_NEAR_START_M = 60   # rule (3): an untipped box joins the hole whose line starts nearest
TEE_TIP_M = 10          # rule (1): a tip farther than this from every box sets no box
LABEL_NEAR_LINE_M = 80

failures = []


def fail(msg):
    failures.append(msg)


def sha(name):
    """The input's sha256 with CRLF read as LF: the committed file's hash in any
    checkout (docs/SPEC_hole-overview.md 14.2, R3). Every input here is text."""
    with open(os.path.join(MAP, name), 'rb') as f:
        return hashlib.sha256(f.read().replace(b'\r\n', b'\n')).hexdigest()


def r7(v):
    return round(v, 7)


def ll_pt(t):
    return {'lat': r7(t[0]), 'lon': r7(t[1])}


def dist_to_ring(ll, ring, inners=()):
    """0 inside (outer and not inner), else the distance to the nearest edge, metres."""
    pt = xy(ll)
    R = [xy(q) for q in ring]
    I = [[xy(q) for q in r] for r in inners]
    if len(R) > 2 and in_ring(pt, R) and not any(len(r) > 2 and in_ring(pt, r) for r in I):
        return 0.0
    return min(seg(pt, rr[k - 1], rr[k]) for rr in [R] + I for k in range(1, len(rr)))


def dist_to_line(ll, line):
    pt = xy(ll)
    L = [xy(q) for q in line]
    if len(L) == 1:
        return math.hypot(pt[0] - L[0][0], pt[1] - L[0][1])
    return min(seg(pt, L[k - 1], L[k]) for k in range(1, len(L)))


def centroid(ring):
    """Area-weighted centroid in the planar frame; vertex mean when degenerate."""
    P = [xy(q) for q in ring]
    a = cx = cy = 0.0
    for i in range(len(P) - 1):
        (x1, y1), (x2, y2) = P[i], P[i + 1]
        c = x1 * y2 - x2 * y1
        a += c
        cx += (x1 + x2) * c
        cy += (y1 + y2) * c
    if abs(a) < 1e-9:
        pts = ring[:-1] if ring[0] == ring[-1] else ring
        return (sum(q[0] for q in pts) / len(pts), sum(q[1] for q in pts) / len(pts))
    lon = cx / (3 * a) / RM['N']
    lat = cy / (3 * a) / RM['M']
    return (lat, lon)


with open(os.path.join(MAP, 'osm_full.json'), encoding='utf-8') as f:
    els = json.load(f)['elements']
with open(os.path.join(MAP, 'veenker_confirmed_corrections.json'), encoding='utf-8') as f:
    corr = json.load(f)
with open(os.path.join(MAP, 'markup_lines.json'), encoding='utf-8') as f:
    markup = json.load(f)

golf = lambda e: e.get('tags', {}).get('golf')
way_ring = lambda e: [(p['lat'], p['lon']) for p in e['geometry']]


def rel_rings(e):
    grab = lambda role: [[(p['lat'], p['lon']) for p in m.get('geometry', []) if p]
                         for m in e.get('members', []) if m.get('role') == role]
    return join_rings(grab('outer')), join_rings(grab('inner'))


# ------------------------------------------------------------------ polygons
polys = []   # {id, kind, ring (tuples), inner (list of rings), ref}
skipped = []
KIND = {'green': 'green', 'tee': 'tee', 'bunker': 'bunker', 'fairway': 'fairway',
        'lateral_water_hazard': 'water'}
for e in els:
    g = golf(e)
    t = e.get('tags', {})
    is_creek = e['type'] == 'relation' and t.get('natural') == 'water'
    if g not in KIND and not is_creek:
        continue
    kind = 'water' if is_creek else KIND[g]
    if e['type'] == 'way':
        ring = way_ring(e)
        if ring[0] != ring[-1]:
            skipped.append((e['id'], kind, 'way not closed'))
            continue
        polys.append({'id': e['id'], 'kind': kind, 'ring': ring, 'inner': [], 'ref': t.get('ref')})
    else:
        outers, inners = rel_rings(e)
        closed = [r for r in outers if len(r) > 3 and r[0] == r[-1]]
        if len(closed) != len(outers):
            skipped.append((e['id'], kind, f'{len(outers) - len(closed)} of {len(outers)} outer rings do not close'))
            continue
        cinner = [r for r in inners if len(r) > 3 and r[0] == r[-1]]
        if len(cinner) != len(inners):
            skipped.append((e['id'], kind, f'{len(inners) - len(cinner)} inner rings do not close (inners dropped)'))
        for k, r in enumerate(closed):
            # One polygon per outer ring. Inner rings go with the outer that contains them.
            mine = [ir for ir in cinner if in_ring(xy(ir[0]), [xy(q) for q in r])]
            pid = e['id'] if len(closed) == 1 else f"{e['id']}-{k + 1}"
            polys.append({'id': pid, 'kind': kind, 'ring': r, 'inner': mine, 'ref': t.get('ref')})

holes = sorted((e for e in els if golf(e) == 'hole'), key=lambda e: int(e['tags']['ref']))
if [int(h['tags']['ref']) for h in holes] != list(range(1, 19)):
    fail('hole refs are not exactly 1..18')

greens = [p for p in polys if p['kind'] == 'green']
tees = [p for p in polys if p['kind'] == 'tee']
for p in polys:
    p['holes'] = []
    if p['kind'] == 'tee':
        p['sets'] = []

# ------------------------------------------------------------- holes: greens
out_holes = []
green_how = {}
for h in holes:
    n = int(h['tags']['ref'])
    line = way_ring(h)
    last, first = line[-1], line[0]
    inside = [g for g in greens if dist_to_ring(last, g['ring']) == 0.0]
    if len(inside) == 1:
        green, how = inside[0], 'contained'
    elif len(inside) > 1:
        fail(f'hole {n}: line end inside {len(inside)} greens')
        green, how = None, 'ambiguous'
    else:
        d, green = min(((dist_to_ring(last, g['ring']), g) for g in greens), key=lambda x: x[0])
        if d <= GREEN_CONTAIN_FALLBACK_M:
            how = f'nearest {d:.1f} m'
        else:
            fail(f'hole {n}: no green contains the line end and the nearest is {d:.1f} m')
            green, how = None, 'none'
    green_how[n] = how
    if green is not None and n not in green['holes']:
        green['holes'].append(n)
    out_holes.append({
        'number': n,
        'par': int(h['tags']['par']),
        'hcp': int(h['tags']['handicap']),
        'osmName': h['tags'].get('name'),
        'osmId': h['id'],
        'line': [ll_pt(q) for q in line],
        'greenId': green['id'] if green else None,
        'teeIds': [],
        'fairwayIds': [],
        'bunkerIds': [],
        '_line': line,
    })

# ------------------------------------------------------------------- tees
# Fable's corrected Section 1.2 rule (2026-09-26), in priority order.
H = {h['number']: h for h in out_holes}
tee_el = {e['id']: e for e in els if golf(e) == 'tee'}
line_start = {h['number']: h['_line'][0] for h in out_holes}

# (1) His markup tips are the authority: every keyed blue / yellow leader maps
# its hole ('R7' is hole 8) and set onto the nearest tee polygon by dist_m.
tipped = set()
unmatched_tips = []
for ln in markup:
    if ln['color'] not in ('blue', 'yellow'):
        continue
    k = key_for(ln)
    if k is None:
        continue
    n = 8 if k == 'R7' else int(k) if k.isdigit() else None
    if n is None:
        continue
    colour = 'blue' if ln['color'] == 'blue' else 'gold'
    ll = to_ll(*ln['tip'])
    d, t = min(((dist_m(ll, tee_el[t['id']]), t) for t in tees), key=lambda x: (x[0], str(x[1]['id'])))
    if d > TEE_TIP_M:
        unmatched_tips.append((n, colour, d, t['id']))
        continue
    tipped.add(t['id'])
    if n not in t['holes']:
        t['holes'].append(n)
    if colour not in t['sets']:
        t['sets'].append(colour)

# (2) Hole 9 has no tips: its tees are exactly the corrections file's ids. Its
# blue and gold boxes are the corrections file's `blue_tee_osm_id` and
# `gold_tee_osm_id` - his "yes to 9", 2026-09-15 (README, Confirmed facts;
# docs/SPEC_hole-overview.md Section 7). The other hole 9 box carries no set.
h9_ids = corr['hole9']['tee_osm_ids_near_line_start']
h9_sets = {corr['hole9']['blue_tee_osm_id']: 'blue', corr['hole9']['gold_tee_osm_id']: 'gold'}
for tid in h9_sets:
    if tid not in h9_ids:
        fail(f'hole 9 {h9_sets[tid]} tee {tid} (corrections) is not one of its tees {h9_ids}')
tee_by_pid = {t['id']: t for t in tees}
for tid in h9_ids:
    t = tee_by_pid.get(tid)
    if t is None:
        fail(f'hole 9 tee {tid} (corrections) is not a tee polygon')
    elif tid in tipped:
        fail(f'hole 9 tee {tid} (corrections) carries a markup tip')
    else:
        if 9 not in t['holes']:
            t['holes'].append(9)
        if tid in h9_sets and h9_sets[tid] not in t['sets']:
            t['sets'].append(h9_sets[tid])

# (3) Every other untipped box: the hole whose line START is nearest, if <= 60 m.
for t in tees:
    if t['id'] in tipped or t['id'] in h9_ids:
        continue
    d, n = min((dist_m(line_start[n], tee_el[t['id']]), n) for n in sorted(line_start))
    if d <= TEE_NEAR_START_M:
        t['holes'].append(n)

for t in tees:
    t['sets'].sort(key=lambda s: ('blue', 'gold').index(s))
    for n in t['holes']:
        H[n]['teeIds'].append(t['id'])
for h in out_holes:
    # Nearest the line's first point first: teeIds[0] is the box the hole line starts on.
    h['teeIds'].sort(key=lambda i: (round(dist_m(h['_line'][0], tee_el[i]), 3), str(i)))
    if not h['teeIds']:
        fail(f"hole {h['number']}: no tee polygon")

# The corrections file's hole 8 ids must come out of the rules, never be typed in.
c8 = corr['hole8']
if H[8]['greenId'] != c8['green_osm_id']:
    fail(f"hole 8 green: rule gives {H[8]['greenId']}, corrections say {c8['green_osm_id']}")
for tid in (c8['blue_tee_osm_id'], c8['gold_tee_osm_id']):
    if tid not in H[8]['teeIds']:
        fail(f'hole 8 tee {tid} (corrections) is not among the rule tees {H[8]["teeIds"]}')

# Hole 16's back blue: from the corrections file, never re-derived.
p16 = corr['hole16_back_blue_tee_point']
points = [{'id': 'hole16-back-blue', 'kind': 'tee', 'holes': [16], 'sets': ['blue'],
           'lat': p16['lat'], 'lon': p16['lon'], 'source': 'markup'}]
# Every tip that set no box must be hole 16's blue, the corrections file's point.
for n, colour, d, near in unmatched_tips:
    if (n, colour) != (16, 'blue'):
        fail(f'hole {n} {colour} tip is {d:.1f} m from the nearest tee box {near}')
    else:
        print(f'hole 16 blue tip: {d:.1f} m from the nearest box {near}, carried as the markup point')

# ------------------------------------------------- fairways and bunkers: labels only
for p in polys:
    if p['kind'] not in ('fairway', 'bunker'):
        continue
    if p['kind'] == 'fairway' and p['ref']:
        refs = [int(r) for r in str(p['ref']).replace(',', ';').split(';') if r.strip().isdigit()]
        p['holes'] = refs
    else:
        c = centroid(p['ring'])
        d, n = min((dist_to_line(c, h['_line']), h['number']) for h in out_holes)
        p['holes'] = [n] if d <= LABEL_NEAR_LINE_M else []
    for n in p['holes']:
        H[n]['fairwayIds' if p['kind'] == 'fairway' else 'bunkerIds'].append(p['id'])
for h in out_holes:
    h['fairwayIds'].sort(key=str)
    h['bunkerIds'].sort(key=str)
    h.pop('_line')

for p in polys:
    p['holes'].sort()

# ------------------------------------------------------------------ write
KIND_ORDER = ['green', 'tee', 'fairway', 'bunker', 'water']
polys.sort(key=lambda p: (KIND_ORDER.index(p['kind']), str(p['id'])))
has_inner = any(p['inner'] for p in polys)


def poly_out(p):
    o = {'id': p['id'], 'kind': p['kind'], 'holes': p['holes']}
    if p['kind'] == 'tee':
        o['sets'] = p['sets']
    o['ring'] = [ll_pt(q) for q in p['ring']]
    if p['inner']:
        o['inner'] = [[ll_pt(q) for q in r] for r in p['inner']]
    return o


js = lambda v: json.dumps(v, separators=(',', ':'), ensure_ascii=False)
source = {
    'osmPulled': '2026-09-13',
    'generator': 'tools/course-geometry/build_veenker.py',
    'inputsSha256': {'osm_full': sha('osm_full.json'),
                     'corrections': sha('veenker_confirmed_corrections.json'),
                     'markup_lines': sha('markup_lines.json')},
    'licence': 'Course features (c) OpenStreetMap contributors, ODbL 1.0',
}
lines = [
    '/**',
    ' * GENERATED by tools/course-geometry/build_veenker.py - do not edit by hand.',
    ' * Spec: docs/SPEC_course-geometry.md Section 1. Re-run the generator instead.',
    ' *',
    ' * Course features (c) OpenStreetMap contributors, ODbL 1.0',
    ' * (https://www.openstreetmap.org/copyright). Tee colours from Matt\'s markup;',
    ' * `points` are his markup tips, never measured positions.',
    ' */',
    'export const VEENKER_GEOMETRY = {',
    "  courseId: 'veenker',",
    f'  source: {js(source)},',
    '  holes: [',
] + [f'    {js(h)},' for h in out_holes] + [
    '  ],',
    '  polygons: [',
] + [f'    {js(poly_out(p))},' for p in polys] + [
    '  ],',
    '  points: [',
] + [f'    {js(p)},' for p in points] + [
    '  ],',
    '};',
    '',
]

print(f"{'hole':>4} {'green':>12} {'how':>10}  {'tees (sets)':<60} {'fw':>3} {'bk':>3}")
tee_by_id = {t['id']: t for t in tees}
for h in out_holes:
    tt = ', '.join(f"{i}({'/'.join(tee_by_id[i]['sets']) or '-'})" for i in h['teeIds'])
    if h['number'] == 16:
        tt += ', hole16-back-blue(blue, markup point)'
    print(f"{h['number']:>4} {str(h['greenId']):>12} {green_how[h['number']]:>10}  {tt:<60} "
          f"{len(h['fairwayIds']):>3} {len(h['bunkerIds']):>3}")
counts = {k: sum(1 for p in polys if p['kind'] == k) for k in KIND_ORDER}
print('polygons:', counts, '| inner rings carried:', sum(len(p['inner']) for p in polys))
for s in skipped:
    print('skipped:', s)
print(f"tee boxes carrying tips: {len(tipped)}; tee boxes on no hole: {sum(1 for t in tees if not t['holes'])}")
shared = [t['id'] for t in tees if len(t['holes']) > 1]
print('tee boxes serving more than one hole:', [(i, tee_by_id[i]['holes']) for i in shared])

if failures:
    for m in failures:
        print('FAIL:', m, file=sys.stderr)
    sys.exit(1)

text = '\n'.join(lines)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
    f.write(text)
print(f'wrote {os.path.relpath(OUT, ROOT)}: {len(text.encode("utf-8"))} bytes')
