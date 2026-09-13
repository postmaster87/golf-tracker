# -*- coding: utf-8 -*-
"""Match Matt's markup leader-line tips to OSM greens and tees, using the
extent the imagery server actually returned. Prints no coordinates."""
import json, math, os

HERE = os.path.dirname(os.path.abspath(__file__))
P = lambda n: os.path.join(HERE, n)

ext = json.load(open(P('basemap_true_extent.json')))
W, H = ext['width'], ext['height']
lines = json.load(open(P('markup_lines.json')))
els = json.load(open(P('osm_full.json'), encoding='utf-8'))['elements']
lat0 = (ext['ymin'] + ext['ymax']) / 2
M, N = 111320.0, 111320.0 * math.cos(math.radians(lat0))


def to_ll(px, py):
    return (ext['ymax'] - py / H * (ext['ymax'] - ext['ymin']),
            ext['xmin'] + px / W * (ext['xmax'] - ext['xmin']))


xy = lambda p: (p[1] * N, p[0] * M)
kind = lambda e: e.get('tags', {}).get('golf')


def join_rings(ways):
    ways = [list(w) for w in ways if len(w) >= 2]
    rings = []
    while ways:
        ring = ways.pop(0)
        ch = True
        while ring[0] != ring[-1] and ch:
            ch = False
            for i, w in enumerate(ways):
                if w[0] == ring[-1]:
                    ring += w[1:]
                elif w[-1] == ring[-1]:
                    ring += w[::-1][1:]
                elif w[-1] == ring[0]:
                    ring = w[:-1] + ring
                elif w[0] == ring[0]:
                    ring = w[::-1][:-1] + ring
                else:
                    continue
                ways.pop(i)
                ch = True
                break
        rings.append(ring)
    return rings


def rings_of(e):
    if e['type'] == 'way':
        return [[(p['lat'], p['lon']) for p in e.get('geometry', []) if p]], []
    grab = lambda role: [[(p['lat'], p['lon']) for p in m.get('geometry', []) if p]
                         for m in e.get('members', []) if m.get('role') == role]
    return join_rings(grab('outer')), join_rings(grab('inner'))


def in_ring(pt, R):
    x, y = pt
    c = False
    for i in range(len(R)):
        (x1, y1), (x2, y2) = R[i], R[i - 1]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            c = not c
    return c


def seg(pt, a, b):
    (px_, py_), (ax, ay), (bx, by) = pt, a, b
    dx, dy = bx - ax, by - ay
    L = dx * dx + dy * dy
    t = 0 if L == 0 else max(0, min(1, ((px_ - ax) * dx + (py_ - ay) * dy) / L))
    return math.hypot(px_ - (ax + t * dx), py_ - (ay + t * dy))


def dist_m(ll, e):
    o, i = rings_of(e)
    pt = xy(ll)
    O = [[xy(q) for q in r] for r in o]
    I = [[xy(q) for q in r] for r in i]
    if any(len(r) > 2 and in_ring(pt, r) for r in O) and not any(len(r) > 2 and in_ring(pt, r) for r in I):
        return 0.0
    return min((seg(pt, r[k - 1], r[k]) for r in O + I for k in range(1, len(r))), default=1e9)


def centroid(e):
    pts = [q for r in rings_of(e)[0] for q in r]
    return (sum(q[0] for q in pts) / len(pts), sum(q[1] for q in pts) / len(pts))


greens = [e for e in els if kind(e) == 'green']
tees = [e for e in els if kind(e) == 'tee']

# (colour, tail pixel, key) read off his markup. 'R7' is the right-hand
# "7 GREEN" / "7 TEES" pair beside the short game area.
LABELS = [
    ('black', (443, 733), '15'), ('black', (1726, 708), '14'), ('black', (2048, 702), '18'),
    ('black', (2754, 947), '9'), ('black', (3029, 973), 'RANGE'), ('black', (473, 1313), '4'),
    ('black', (1402, 1942), '3'), ('black', (2251, 1884), '1'), ('black', (2467, 1920), '17'),
    ('black', (2837, 1917), '10'), ('black', (3214, 1881), 'SHORT GAME'), ('black', (3374, 1914), '7'),
    ('black', (3602, 1894), 'R7'), ('black', (1480, 1986), '16'), ('black', (1956, 2060), '13'),
    ('black', (412, 2345), '5'), ('black', (761, 2344), '2'), ('black', (1176, 2389), '12'),
    ('black', (2351, 2318), '11'), ('black', (992, 2518), '6'),
    ('blue', (1626, 524), '15'), ('yellow', (1578, 523), '15'),
    ('blue', (1917, 703), '1'), ('yellow', (1948, 704), '1'),
    ('blue', (2146, 702), '10'), ('blue', (2188, 706), '10'), ('yellow', (2203, 703), '10'),
    ('blue', (568, 983), '16'), ('yellow', (597, 980), '16'),
    ('blue', (362, 1313), '5'), ('yellow', (389, 1317), '5'),
    ('blue', (1274, 1780), '4'), ('yellow', (1238, 1783), '4'),
    ('blue', (1936, 1654), '14'), ('yellow', (1891, 1656), '14'),
    ('blue', (2624, 1917), '11'), ('yellow', (2566, 1917), '11'),
    ('blue', (2670, 1914), '18'), ('yellow', (2723, 1909), '18'),
    ('blue', (3466, 1915), 'R7'), ('yellow', (3506, 1918), 'R7'),
    ('blue', (1447, 2008), '2'), ('yellow', (1429, 2014), '2'),
    ('blue', (1925, 1980), '17'), ('yellow', (1962, 1977), '17'),
    ('blue', (489, 2339), '6'), ('yellow', (499, 2341), '6'),
    ('blue', (573, 2346), '3'), ('yellow', (599, 2342), '3'),
    ('blue', (1381, 2385), '13'), ('yellow', (1369, 2360), '13'),
    ('blue', (2243, 2316), '12'), ('yellow', (2209, 2318), '12'),
    ('blue', (1646, 2528), '7'), ('yellow', (1668, 2521), '7'),
]


def key_for(ln):
    c = [(math.hypot(t[0] - ln['tail'][0], t[1] - ln['tail'][1]), k) for col, t, k in LABELS if col == ln['color']]
    d, k = min(c)
    return k if d <= 3 else None


green_of, blue_of, gold_of = {}, {}, {}
misses, unlabelled = [], 0
for ln in lines:
    k = key_for(ln)
    if k is None:
        unlabelled += 1
        continue
    ll = to_ll(*ln['tip'])
    pool = greens if ln['color'] == 'black' else tees
    best = min(pool, key=lambda e: dist_m(ll, e))
    d = dist_m(ll, best)
    misses.append((d, ln['color'], k))
    if ln['color'] == 'black':
        green_of[k] = (d, centroid(best))
    elif ln['color'] == 'blue':
        blue_of.setdefault(k, []).append((d, ll))
    else:
        gold_of.setdefault(k, []).append((d, ll))

ds = sorted(m[0] for m in misses)
print(f"lines matched: {len(misses)}, unlabelled: {unlabelled}")
print(f"tip-to-feature miss (m): median {ds[len(ds)//2]:.1f}, 90th pct {ds[int(len(ds)*0.9)]:.1f}, max {ds[-1]:.1f}")
print("largest misses:", [(round(d, 1), c, k) for d, c, k in sorted(misses, reverse=True)[:6]])

CARD_B = [435, 334, 333, 349, 402, 210, 590, 181, 537, 560, 155, 330, 160, 416, 420, 544, 182, 534]
CARD_G = [419, 283, 289, 340, 350, 185, 531, 157, 495, 473, 134, 306, 144, 397, 386, 485, 152, 521]
yd = lambda a, b: math.hypot(xy(a)[0] - xy(b)[0], xy(a)[1] - xy(b)[1]) * 1.09361

print(f"\n{'hole':>10} {'green miss':>10} {'blue miss':>11} {'gold miss':>10}   {'blue tee->green yd':>20}   {'gold tee->green yd':>20}")
for k in [str(i) for i in range(1, 19)] + ['R7', 'RANGE', 'SHORT GAME']:
    g = green_of.get(k)
    bl = blue_of.get(k, [])
    go = gold_of.get(k, [])
    gm = f"{g[0]:.1f}m" if g else '-'
    bm = ', '.join(f"{b[0]:.0f}m" for b in bl) or '-'
    om = ', '.join(f"{o[0]:.0f}m" for o in go) or '-'
    if g:
        byd = ', '.join(f"{yd(b[1], g[1]):.0f}" for b in bl) or '-'
        oyd = ', '.join(f"{yd(o[1], g[1]):.0f}" for o in go) or '-'
    else:
        byd = oyd = '-'
    if k.isdigit():
        byd += f" (card {CARD_B[int(k) - 1]})"
        oyd += f" (card {CARD_G[int(k) - 1]})"
    print(f"{k:>10} {gm:>10} {bm:>11} {om:>10}   {byd:>20}   {oyd:>20}")
