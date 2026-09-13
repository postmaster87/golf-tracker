# -*- coding: utf-8 -*-
"""OSM course features over the aerial photo, with no text, labels or analysis.

Reads osm_full.json, frame.json, basemap.png from this folder.
Writes veenker-osm-clean.png.
"""
import json, os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
P = lambda n: os.path.join(HERE, n)

els = json.load(open(P('osm_full.json'), encoding='utf-8'))['elements']
fr = json.load(open(P('frame.json')))
W, H = fr['width'], fr['height']
kind = lambda e: e.get('tags', {}).get('golf') or ('natural=' + e.get('tags', {}).get('natural', '?'))


# The imagery server forces square pixels in degrees, so the photo it returns
# covers more latitude than the requested frame (1216 m tall, not 903 m).
# Drawing must use the extent the server actually returned.
_true = json.load(open(P('basemap_true_extent.json')))


def px(lat, lon):
    return ((lon - _true['xmin']) / (_true['xmax'] - _true['xmin']) * W,
            (_true['ymax'] - lat) / (_true['ymax'] - _true['ymin']) * H)


def join_rings(ways):
    ways = [list(w) for w in ways if len(w) >= 2]
    rings = []
    while ways:
        ring = ways.pop(0)
        changed = True
        while ring[0] != ring[-1] and changed:
            changed = False
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
                changed = True
                break
        rings.append(ring)
    return rings


def rings_of(e):
    if e['type'] == 'way':
        return [[(p['lat'], p['lon']) for p in e.get('geometry', []) if p]], []
    if e['type'] == 'relation':
        grab = lambda role: [[(p['lat'], p['lon']) for p in m.get('geometry', []) if p]
                             for m in e.get('members', []) if m.get('role') == role]
        return join_rings(grab('outer')), join_rings(grab('inner'))
    return [], []


STYLE = {
    'natural=water': ((70, 160, 255, 60), (0, 90, 210, 255), 3),
    'lateral_water_hazard': ((70, 160, 255, 80), (0, 90, 210, 255), 4),
    'water_hazard': ((70, 160, 255, 80), (0, 90, 210, 255), 4),
    'fairway': ((140, 230, 100, 60), (20, 150, 40, 255), 4),
    'tee': ((110, 170, 255, 100), (20, 60, 210, 255), 4),
    'bunker': ((250, 225, 150, 150), (210, 120, 10, 255), 4),
    'green': ((70, 240, 110, 110), (0, 110, 35, 255), 5),
}
ORDER = ['natural=water', 'lateral_water_hazard', 'water_hazard', 'fairway', 'tee', 'bunker', 'green']

base = Image.open(P('basemap.png')).convert('RGB').resize((W, H)).convert('RGBA')
for k in ORDER:
    fill_l = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    line_l = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    fd, ld = ImageDraw.Draw(fill_l), ImageDraw.Draw(line_l)
    fill, stroke, width = STYLE[k]
    for e in (x for x in els if kind(x) == k):
        outer, inner = rings_of(e)
        for r in outer:
            if len(r) > 2:
                fd.polygon([px(*q) for q in r], fill=fill)
        for r in inner:
            if len(r) > 2:
                fd.polygon([px(*q) for q in r], fill=(0, 0, 0, 0))
        for r in outer + inner:
            if len(r) > 1:
                ld.line([px(*q) for q in r] + [px(*r[0])], fill=stroke, width=width)
    base = Image.alpha_composite(base, fill_l)
    base = Image.alpha_composite(base, line_l)

d = ImageDraw.Draw(base)
for e in (x for x in els if kind(x) == 'hole'):
    line = [px(p['lat'], p['lon']) for p in e.get('geometry', []) if p]
    if len(line) > 1:
        d.line(line, fill=(255, 255, 255, 255), width=9)
        d.line(line, fill=(220, 20, 30, 255), width=5)

base.convert('RGB').save(P('veenker-osm-clean.png'), optimize=True)
print('wrote veenker-osm-clean.png', W, 'x', H)
