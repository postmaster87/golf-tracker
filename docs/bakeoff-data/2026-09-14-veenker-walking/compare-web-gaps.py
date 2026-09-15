#!/usr/bin/env python3
"""
golf-tracker's GPS gaps on the 2026-09-14 walking round at Veenker, set against
what Bake-off K and Bake-off T recorded in the same windows on the same phone.

For every gap over 20 s in golf-tracker's own track for that round, it prints:
- how many fixes K and T each logged inside the gap
- K's non-heartbeat phone events within 60 s of the gap (screen off/on and
  the like)

Run from anywhere:
  python docs/bakeoff-data/2026-09-14-veenker-walking/compare-web-gaps.py
"""
import csv
import json
import os
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
EXPORT = os.path.join(HERE, 'golf-tracker-20260914-1807.json')
K = os.path.join(HERE, 'golf-bakeoff', 'K', '20260914-160716-K')
T = os.path.join(HERE, 'golf-bakeoff', 'T', '20260914-160724-T')
GAP_MS = 20_000


def clock(ms):
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).astimezone().strftime('%H:%M:%S')


def fixes(session_dir):
    with open(os.path.join(session_dir, 'fixes.csv'), encoding='utf-8', newline='') as f:
        rows = csv.reader(f)
        header = next(rows)
        i = header.index('fix_ms')
        return [int(c[i]) for c in rows if len(c) == len(header) and c[i].isdigit()]


def events(session_dir):
    with open(os.path.join(session_dir, 'events.csv'), encoding='utf-8', newline='') as f:
        rows = list(csv.reader(f))[1:]
    return [(int(c[0]), c[2]) for c in rows if len(c) == 4 and c[2] != 'hb']


def main():
    with open(EXPORT, encoding='utf-8') as f:
        export = json.load(f)
    rounds = [r['id'] for r in export['rounds'] if (r.get('startedAt') or '').startswith('2026-09-14')]
    print('rounds started 2026-09-14 in the export:', rounds)
    ts = sorted(p[3] for p in export['tracks'][rounds[0]])
    gaps = [(a, b) for a, b in zip(ts, ts[1:]) if b - a > GAP_MS]
    k_fixes, t_fixes, k_events = fixes(K), fixes(T), events(K)
    print('golf-tracker track: %s -> %s, %d fixes, %d gaps over 20 s' % (clock(ts[0]), clock(ts[-1]), len(ts), len(gaps)))
    for a, b in gaps:
        inside_k = sum(1 for t in k_fixes if a < t < b)
        inside_t = sum(1 for t in t_fixes if a < t < b)
        near = ['%s %s' % (clock(w), kind) for w, kind in k_events if a - 60_000 <= w <= b + 60_000]
        print('  gap %s -> %s (%.0f s): K fixes inside %d, T fixes inside %d; phone events within 60 s: %s' % (
            clock(a), clock(b), (b - a) / 1000, inside_k, inside_t, ', '.join(near) or 'none'))


if __name__ == '__main__':
    main()
