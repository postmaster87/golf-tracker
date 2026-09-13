# -*- coding: utf-8 -*-
"""Pull Matt's markup out of veenker-aerial-Matt.png.

He drew on the clean photo (basemap.png) in Paint: black leader = green,
blue = blue tee, yellow = gold tee, white text = the label. Diffing the two
images leaves only his strokes. Each coloured leader is traced, its two ends
found, and the end nearer the white label is the tail; the other is the tip
he was pointing at.

Writes markup_lines.json in pixels only. rematch.py turns tips into positions
with basemap_true_extent.json (never frame.json - see fetch_sources.py).
"""
import json, os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
P = lambda n: os.path.join(HERE, n)

clean = np.asarray(Image.open(P('basemap.png')).convert('RGB')).astype(np.int16)
mark = np.asarray(Image.open(P('veenker-aerial-Matt.png')).convert('RGB')).astype(np.int16)
assert clean.shape == mark.shape, (clean.shape, mark.shape)

changed = np.abs(mark - clean).max(axis=2) > 40
r, g, b = mark[..., 0], mark[..., 1], mark[..., 2]
# Paint's colours were exactly (0,0,0), (63,72,204), (255,242,0) and white.
cls = {
    'black': changed & (np.maximum(np.maximum(r, g), b) < 70),
    'white': changed & (np.minimum(np.minimum(r, g), b) > 200),
    'yellow': changed & (r > 170) & (g > 150) & (b < 120),
    'blue': changed & (b > 130) & (r < 130) & (g < 150) & ((b - r) > 40),
}
print('changed px:', int(changed.sum()), {k: int(m.sum()) for k, m in cls.items()})


def components(m):
    """8-connected components of at least 40 px, as (xs, ys) arrays."""
    try:
        from scipy import ndimage
        lab, _ = ndimage.label(m, structure=np.ones((3, 3)))
        out = []
        for i, sl in enumerate(ndimage.find_objects(lab), 1):
            if sl is None:
                continue
            ys, xs = np.nonzero(lab[sl] == i)
            if len(xs) >= 40:
                out.append((xs + sl[1].start, ys + sl[0].start))
        return out
    except ImportError:
        seen = np.zeros(m.shape, bool)
        out = []
        for y0, x0 in zip(*np.nonzero(m)):
            if seen[y0, x0]:
                continue
            stack = [(y0, x0)]
            seen[y0, x0] = True
            ys, xs = [], []
            while stack:
                y, x = stack.pop()
                ys.append(y)
                xs.append(x)
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        yy, xx = y + dy, x + dx
                        if 0 <= yy < m.shape[0] and 0 <= xx < m.shape[1] and m[yy, xx] and not seen[yy, xx]:
                            seen[yy, xx] = True
                            stack.append((yy, xx))
            if len(xs) >= 40:
                out.append((np.array(xs), np.array(ys)))
        return out


wy, wx = np.nonzero(cls['white'])
white_pts = np.stack([wx, wy], 1).astype(np.float64)

rows = []
for color in ('black', 'blue', 'yellow'):
    for xs, ys in components(cls[color]):
        pts = np.stack([xs, ys], 1).astype(np.float64)
        mean = pts.mean(0)
        w, v = np.linalg.eigh(np.cov((pts - mean).T))
        axis = v[:, np.argmax(w)]
        proj = (pts - mean) @ axis
        lo, hi = proj.min(), proj.max()
        if hi - lo < 25:
            continue
        e1 = pts[proj <= lo + 2].mean(0)
        e2 = pts[proj >= hi - 2].mean(0)
        d1 = np.sqrt(((white_pts - e1) ** 2).sum(1)).min()
        d2 = np.sqrt(((white_pts - e2) ** 2).sum(1)).min()
        tip, tail, dtail = (e2, e1, d1) if d1 < d2 else (e1, e2, d2)
        rows.append({'color': color, 'len_px': int(round(hi - lo)),
                     'tail': [int(round(tail[0])), int(round(tail[1]))],
                     'tip': [int(round(tip[0])), int(round(tip[1]))],
                     'tail_to_text_px': int(round(float(dtail)))})

json.dump(rows, open(P('markup_lines.json'), 'w'), indent=1)
counts = {}
for row in rows:
    counts[row['color']] = counts.get(row['color'], 0) + 1
print('leader lines:', counts, '-> markup_lines.json')
