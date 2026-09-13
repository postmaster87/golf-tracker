# -*- coding: utf-8 -*-
"""Re-pull the two public sources behind the Veenker course map.

  osm_full.json             every golf feature INSIDE the course outline (way 44804299)
  basemap.png               USDA NAIP 2025 photo for frame.json, from ISU's ortho server
  basemap_true_extent.json  the extent the server ACTUALLY returned for that photo

Two traps this script exists to avoid, both hit on 2026-09-13:

 1. `nwr(around.course:150)` measures from the outline WAY (the boundary line),
    so everything deep inside the course is silently dropped. Query the AREA.
 2. ISU's ArcGIS `exportImage` with imageSR=4326 forces square pixels in degrees.
    A 4200x3311 request for a 1146 x 903 m frame came back covering 1146 x 1216 m.
    Always read the real extent back with f=json and draw with that.

Prints no coordinates.
"""
import json, math, os, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
P = lambda n: os.path.join(HERE, n)
UA = {'User-Agent': 'golf-tracker-course-map (personal project)'}

OVERPASS = 'https://overpass.kumi.systems/api/interpreter'
QUERY = """[out:json][timeout:150];
way(44804299)->.course;
.course map_to_area->.inside;
(
  nwr(area.inside)["golf"];
  nwr(area.inside)["natural"~"^(sand|water)$"];
  nwr(around.course:150)["golf"];
);
out meta geom;"""


def fetch_osm():
    body = urllib.parse.urlencode({'data': QUERY}).encode()
    data = urllib.request.urlopen(urllib.request.Request(OVERPASS, data=body, headers=UA), timeout=170).read()
    d = json.loads(data)
    json.dump(d, open(P('osm_full.json'), 'w', encoding='utf-8'))
    kinds = {}
    for e in d['elements']:
        k = e.get('tags', {}).get('golf') or ('natural=' + e.get('tags', {}).get('natural', '?'))
        kinds[k] = kinds.get(k, 0) + 1
    holes = sorted({str(e['tags'].get('ref')) for e in d['elements'] if e.get('tags', {}).get('golf') == 'hole'},
                   key=lambda r: int(r) if r.isdigit() else 99)
    print('osm features:', dict(sorted(kinds.items())))
    print('hole lines:', holes)


def fetch_photo():
    fr = json.load(open(P('frame.json')))
    base = 'https://ortho.gis.iastate.edu/arcgis/rest/services/ortho/naip_2025_nc/ImageServer/exportImage'
    params = {'bbox': f"{fr['minlon']},{fr['minlat']},{fr['maxlon']},{fr['maxlat']}", 'bboxSR': 4326, 'imageSR': 4326,
              'size': f"{fr['width']},{fr['height']}", 'format': 'png', 'bandIds': '0,1,2',
              'interpolation': 'RSP_BilinearInterpolation'}
    meta = json.load(urllib.request.urlopen(urllib.request.Request(
        base + '?' + urllib.parse.urlencode({**params, 'f': 'json'}), headers=UA), timeout=90))
    ext = meta['extent']
    json.dump({'xmin': ext['xmin'], 'xmax': ext['xmax'], 'ymin': ext['ymin'], 'ymax': ext['ymax'],
               'width': meta['width'], 'height': meta['height']}, open(P('basemap_true_extent.json'), 'w'))
    lat0 = (fr['minlat'] + fr['maxlat']) / 2
    mlon = 111320 * math.cos(math.radians(lat0))
    print(f"photo: requested {(fr['maxlon'] - fr['minlon']) * mlon:.0f} x {(fr['maxlat'] - fr['minlat']) * 111320:.0f} m,"
          f" returned {(ext['xmax'] - ext['xmin']) * mlon:.0f} x {(ext['ymax'] - ext['ymin']) * 111320:.0f} m")
    img = urllib.request.urlopen(urllib.request.Request(
        base + '?' + urllib.parse.urlencode({**params, 'f': 'image'}), headers=UA), timeout=180)
    assert img.headers.get('Content-Type', '').startswith('image'), img.headers.get('Content-Type')
    open(P('basemap.png'), 'wb').write(img.read())
    print('basemap.png written')


if __name__ == '__main__':
    fetch_osm()
    fetch_photo()
