# -*- coding: utf-8 -*-
"""Check Matt's answers (hole 8 label, hole 9 tees, hole 16 back blue tee)
against OSM geometry. Prints distances and compass directions, never coordinates."""
import json, math, os

HERE = os.path.dirname(os.path.abspath(__file__))
P = lambda n: os.path.join(HERE, n)

ext = json.load(open(P('basemap_true_extent.json')))
W, H = ext['width'], ext['height']
lines = json.load(open(P('markup_lines.json')))
els = json.load(open(P('osm_full.json'), encoding='utf-8'))['elements']
lat0 = (ext['ymin'] + ext['ymax']) / 2
M, N = 111320.0, 111320.0 * math.cos(math.radians(lat0))
to_ll = lambda px, py: (ext['ymax'] - py / H * (ext['ymax'] - ext['ymin']),
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


def compass(frm, to):
    (fx, fy), (tx, ty) = xy(frm), xy(to)
    ang = (math.degrees(math.atan2(tx - fx, ty - fy)) + 360) % 360
    names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
    return names[int((ang + 22.5) // 45) % 8], round(ang)


def metres(a, b):
    (ax, ay), (bx, by) = xy(a), xy(b)
    return math.hypot(ax - bx, ay - by)


def tip_for(color, tail):
    ln = min((l for l in lines if l['color'] == color), key=lambda l: math.hypot(l['tail'][0] - tail[0], l['tail'][1] - tail[1]))
    return to_ll(*ln['tip'])


greens = [e for e in els if kind(e) == 'green']
tees = [e for e in els if kind(e) == 'tee']
holes = {str(e['tags'].get('ref')): e for e in els if kind(e) == 'hole'}
nearest = lambda pool, ll: min(pool, key=lambda e: dist_m(ll, e))

# 1. Hole 8: his right-hand "7" labels.
g8 = nearest(greens, tip_for('black', (3602, 1894)))
t8b = nearest(tees, tip_for('blue', (3466, 1915)))
t8y = nearest(tees, tip_for('yellow', (3506, 1918)))
h8 = holes['8']['geometry']
line8_end_in_g8 = dist_m((h8[-1]['lat'], h8[-1]['lon']), g8)
line8_start_to_tees = min(dist_m((h8[0]['lat'], h8[0]['lon']), t8b), dist_m((h8[0]['lat'], h8[0]['lon']), t8y))
print(f"HOLE 8: OSM hole-8 line ends {line8_end_in_g8:.1f} m from the green he marked; starts {line8_start_to_tees:.1f} m from the tees he marked")

# 2. Hole 9 tees vs the hole 8 green.
h9 = holes['9']['geometry']
start9 = (h9[0]['lat'], h9[0]['lon'])
tees9 = sorted(tees, key=lambda e: dist_m(start9, e))[:3]
g8c = centroid(g8)
print("HOLE 9: the three tee boxes nearest the start of OSM's hole-9 line, relative to the 8 green:")
for t in tees9:
    d_line = dist_m(start9, t)
    c = centroid(t)
    print(f"   tee {t['id']}: {d_line:.1f} m from the line start; {metres(g8c, c):.0f} m {compass(g8c, c)[0]} ({compass(g8c, c)[1]} deg) of the 8 green centre")

# 3. Hole 16 back blue tee.
b16 = tip_for('blue', (568, 983))
y16 = tip_for('yellow', (597, 980))
gold16 = nearest(tees, y16)
g15 = nearest(greens, tip_for('black', (443, 733)))
gc, g15c = centroid(gold16), centroid(g15)
along = None
(ax, ay), (bx, by), (px_, py_) = xy(gc), xy(g15c), xy(b16)
L2 = (bx - ax) ** 2 + (by - ay) ** 2
t = ((px_ - ax) * (bx - ax) + (py_ - ay) * (by - ay)) / L2
off = seg((px_, py_), (ax, ay), (bx, by))
print(f"HOLE 16 blue mark: {dist_m(b16, gold16):.0f} m from the 16 gold tee box, {dist_m(b16, g15):.0f} m from the 15 green edge,"
      f" {t*100:.0f}% of the way from 16 gold tees to 15 green, {off:.0f} m off that line")
print(f"   nearest mapped tee of any kind: {min(dist_m(b16, e) for e in tees):.0f} m away")

json.dump({
    'note': 'Matt-confirmed Veenker corrections to OSM, 2026-09-13. Positions are from his markup tips, true image extent.',
    'hole8': {'green_osm_id': g8['id'], 'blue_tee_osm_id': t8b['id'], 'gold_tee_osm_id': t8y['id']},
    'hole9': {'tee_osm_ids_near_line_start': [t['id'] for t in tees9]},
    'hole16_back_blue_tee_point': {'lat': b16[0], 'lon': b16[1], 'source': 'his blue leader tip; box not in OSM'},
    'hole10_blue_plays': 'farther of the two blue boxes (560)',
}, open(P('veenker_confirmed_corrections.json'), 'w'), indent=1)
print('saved veenker_confirmed_corrections.json (coordinates stay in the file)')
