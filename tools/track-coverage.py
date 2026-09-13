#!/usr/bin/env python3
"""
TRACK COVERAGE - the measure behind the coverage table in
docs/HANDOFF-native-build.md (Section 9), and the recorder bake-off's verdict.

The measure, reproduced 6 of 6 rows from the exports in docs/roundDownloads on
2026-09-13 before this file was written:
  span         last fix time minus first fix time (fix times sorted)
  covered      the sum of fix-to-fix intervals of 20 s or less
  gap          a fix-to-fix interval over 20 s; "longest gap" is the largest interval
  median acc   median horizontal accuracy over every fix that carries one

The bar, Matt's pick on 2026-09-13: "99% coverage, no gap > 20 s". Under this
measure a track with no gap over 20 s is 100% covered, so the gap clause decides.

A bake-off session also has a START and a STOP. A recorder that dies before STOP
leaves no fixes after it, which the first-to-last measure cannot see, so for a
session a first fix more than 20 s after START, or a last fix more than 20 s
before STOP, is a gap as well (an "edge gap"). The gap rule itself is unchanged.

The phone runs the same core measure (android/bakeoff/.../Coverage.kt). Both are
held to one fixture, android/bakeoff/app/src/test/resources/coverage-fixture.csv
and its .expected.properties. Run --self-test after touching either.

Usage, from the repo root:
  python tools/track-coverage.py docs/roundDownloads/<web export>.json
  python tools/track-coverage.py docs/roundDownloads/bakeoff        (pulled from the phone)
  python tools/track-coverage.py <path> --exclude-samples            (T without SDK samples)
  python tools/track-coverage.py --self-test
"""

import argparse
import csv
import json
import os
import statistics
import sys
from datetime import datetime, timezone

GAP_MS = 20_000
PASS_COVERED_PCT = 99.0
# Heartbeats are written every 5 s. With none from a running recorder for 15 s,
# the recorder was not running.
HB_ALIVE_MS = 15_000

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIXTURE_DIR = os.path.join(REPO, 'android', 'bakeoff', 'app', 'src', 'test', 'resources')


# ---- the measure ------------------------------------------------------------

def coverage(ts, accs, gap_ms=GAP_MS):
    ts = sorted(ts)
    covered, gaps, longest = 0, [], 0
    for a, b in zip(ts, ts[1:]):
        dt = b - a
        if dt > gap_ms:
            gaps.append((a, b))
        else:
            covered += dt
        longest = max(longest, dt)
    span = ts[-1] - ts[0] if len(ts) >= 2 else 0
    accs = [x for x in accs if x is not None]
    return {
        'fixes': len(ts),
        'span_ms': span,
        'covered_ms': covered,
        'gaps': gaps,
        'longest_gap_ms': longest,
        'median_acc_m': statistics.median(accs) if accs else None,
        'covered_pct': covered * 100.0 / span if span > 0 else None,
    }


def passes(c):
    return c['fixes'] >= 2 and not c['gaps'] and (c['covered_pct'] or 0.0) >= PASS_COVERED_PCT


def verdict(c):
    if c['fixes'] < 2:
        return 'no track'
    if passes(c):
        return 'PASS'
    if c['gaps']:
        return 'FAIL (%d gap%s over 20 s)' % (len(c['gaps']), '' if len(c['gaps']) == 1 else 's')
    return 'FAIL (covered under 99%)'


def edge_gaps(ts, start, end, gap_ms=GAP_MS):
    """START to first fix, and last fix to STOP, when either is over 20 s."""
    if start is None or end is None:
        return []
    if not ts:
        return [(start, end)] if end - start > gap_ms else []
    edges = []
    if min(ts) - start > gap_ms:
        edges.append((start, min(ts)))
    if end - max(ts) > gap_ms:
        edges.append((max(ts), end))
    return edges


def with_edges(c, edges):
    """The same result with the edge gaps counted among the gaps."""
    out = dict(c)
    out['gaps'] = sorted(c['gaps'] + edges)
    out['longest_gap_ms'] = max([c['longest_gap_ms']] + [b - a for a, b in edges])
    return out


def session_verdict(c):
    if c['fixes'] < 2 and not c['gaps']:
        return 'no track'
    return verdict(c) if c['fixes'] >= 2 else 'FAIL (%d gap%s over 20 s)' % (
        len(c['gaps']), '' if len(c['gaps']) == 1 else 's')


# ---- readers ----------------------------------------------------------------

def read_fixes_csv(path, exclude_samples=False):
    """Same rule as Coverage.ofCsvLines: a row counts only with exactly the
    header's columns and a whole number in fix_ms; anything else is counted as
    skipped, never guessed at."""
    ts, accs, skipped, samples = [], [], 0, 0
    with open(path, newline='', encoding='utf-8') as f:
        reader = csv.reader(f)
        header = next(reader, None)
        if not header:
            return ts, accs, skipped, samples
        i_fix, i_acc = header.index('fix_ms'), header.index('acc_m')
        i_sample = header.index('sample') if 'sample' in header else -1
        for cells in reader:
            if not cells:
                continue
            try:
                if len(cells) != len(header):
                    raise ValueError('cut row')
                t = int(cells[i_fix])
            except ValueError:
                skipped += 1
                continue
            if i_sample >= 0 and cells[i_sample] == '1':
                samples += 1
                if exclude_samples:
                    continue
            ts.append(t)
            try:
                accs.append(float(cells[i_acc]) if cells[i_acc] else None)
            except ValueError:
                accs.append(None)
    return ts, accs, skipped, samples


def read_events(path):
    out = []
    if not os.path.exists(path):
        return out
    with open(path, newline='', encoding='utf-8') as f:
        reader = csv.reader(f)
        next(reader, None)
        for cells in reader:
            if len(cells) != 4:
                continue
            try:
                out.append((int(cells[0]), cells[2], cells[3]))
            except ValueError:
                continue
    return out


def find_sdk_stores(session_dir):
    """Every sdk-store-*.json beside a T session (Exporter writes them one level up)."""
    parent = os.path.dirname(os.path.normpath(session_dir))
    return [os.path.join(parent, f) for f in sorted(os.listdir(parent))
            if f.startswith('sdk-store-') and f.endswith('.json')]


def read_sdk_store(path):
    """(fix time ms, accuracy m) for every row in transistorsoft's exported SQLite store.
    A row whose timestamp cannot be read is skipped, never given one."""
    with open(path, encoding='utf-8') as f:
        rows = json.load(f)
    out = []
    for r in rows:
        try:
            t = int(round(datetime.fromisoformat(str(r['timestamp']).replace('Z', '+00:00')).timestamp() * 1000))
        except (KeyError, ValueError):
            continue
        acc = (r.get('coords') or {}).get('accuracy')
        out.append((t, float(acc) if isinstance(acc, (int, float)) else None))
    return out


# ---- output -----------------------------------------------------------------

HEADER = '| Source | Span | Fixes | Covered | Gaps > 20 s | Longest gap | Median accuracy | Bar |'
RULE = '|---|---|---|---|---|---|---|---|'


def row(label, c, bar):
    pct = '%.1f%%' % c['covered_pct'] if c['covered_pct'] is not None else '-'
    acc = '%.1f m' % c['median_acc_m'] if c['median_acc_m'] is not None else '-'
    longest = c['longest_gap_ms']
    return '| %s | %.1f min | %s | %.1f min (%s) | %d | %.1f min (%.0f s) | %s | %s |' % (
        label, c['span_ms'] / 60000, format(c['fixes'], ','), c['covered_ms'] / 60000, pct,
        len(c['gaps']), longest / 60000, longest / 1000, acc, bar)


def clock(ms):
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).astimezone().strftime('%H:%M:%S')


def diagnose_gap(gap, events):
    """Fix clock versus phone clock: both are the phone's, a second or so apart at most.
    The heartbeat says whether the recorder reported itself running; it cannot say why no
    fix arrived. The events listed under each gap are the evidence for that."""
    a, b = gap
    beats = [(w, d) for (w, k, d) in events if k == 'hb' and a < w < b]
    alive = [w for (w, d) in beats if 'recorder=1' in d]
    points = [a] + alive + [b]
    worst = max(y - x for x, y in zip(points, points[1:]))
    if worst <= HB_ALIVE_MS:
        why = 'recorder reported running throughout; no fixes reached the log'
    elif not beats:
        why = 'no heartbeat at all: the app was not running'
    else:
        why = 'recorder not reported running for up to %.0f s of it' % (worst / 1000)
    notable = [(w, k, d) for (w, k, d) in events if k != 'hb' and a - 5000 <= w <= b + 5000]
    return why, notable


def report_session(dirpath, exclude_samples):
    ts, accs, skipped, samples = read_fixes_csv(os.path.join(dirpath, 'fixes.csv'), exclude_samples)
    events = read_events(os.path.join(dirpath, 'events.csv'))
    meta = {}
    try:
        with open(os.path.join(dirpath, 'meta.json'), encoding='utf-8') as f:
            meta = json.load(f)
    except (OSError, ValueError):
        pass
    start = meta.get('started_wall_ms')
    stops = [w for (w, k, _) in events if k == 'stop']
    if stops:
        end, ended = max(stops), 'STOP'
    elif events:
        end, ended = max(w for (w, _, _) in events), 'the last event (no STOP)'
    else:
        end, ended = None, None

    c = with_edges(coverage(ts, accs), edge_gaps(ts, start, end))
    label = os.path.basename(os.path.normpath(dirpath))

    # T keeps its own SQLite record, and a production app on T would read that, so it
    # is scored too, over the same START-to-STOP window. Each export is a snapshot of
    # the whole store; the one holding the most rows from this window is scored. An
    # export with none of them says nothing about this session (it may predate it, or
    # follow a reinstall), so it is reported, never scored as a gap.
    stores = find_sdk_stores(dirpath)
    store, pts = None, []
    if start is not None and end is not None:
        for candidate in stores:
            rows = [(t, a) for (t, a) in read_sdk_store(candidate) if start <= t <= end]
            if len(rows) > len(pts):
                store, pts = candidate, rows

    print(HEADER)
    print(RULE)
    print(row(label + (' - app log' if stores else ''), c, session_verdict(c)))
    sts = [t for t, _ in pts]
    if store:
        sc = with_edges(coverage(sts, [a for _, a in pts]), edge_gaps(sts, start, end))
        print(row('%s - SDK store (%s)' % (label, os.path.basename(store)), sc, session_verdict(sc)))
    print()
    print('recorder: %s' % meta.get('recorder', '?'))
    print('device: %s, Android %s' % (meta.get('device', '?'), meta.get('android', '?')))
    if start is not None and end is not None:
        print('session: START %s -> %s %s (%.1f min); fixes cover %.1f min of it' % (
            clock(start), ended, clock(end), (end - start) / 60000, c['covered_ms'] / 60000))
    # A repeated fix time is an interval of 0 s: it cannot change coverage, but it inflates
    # the fix count, so it is shown rather than silently dropped.
    print('rows skipped: %d; repeated fix times: %d; SDK samples: %d%s' % (
        skipped, len(ts) - len(set(ts)), samples, ' (excluded)' if exclude_samples and samples else ''))
    if store:
        print('SDK store: %d rows in the session window; repeated fix times: %d' % (len(sts), len(sts) - len(set(sts))))
    elif stores:
        print('SDK store: none of the %d exported store file(s) has rows from this session; not scored' % len(stores))
    kinds = {}
    for _, k, _ in events:
        kinds[k] = kinds.get(k, 0) + 1
    print('events: ' + ', '.join('%s %d' % (k, n) for k, n in sorted(kinds.items())))
    for d in [d for (_, k, d) in events if k == 'previous_exit']:
        print('  process died: ' + d)
    for gap in c['gaps']:
        why, notable = diagnose_gap(gap, events)
        print('gap %s -> %s (%.0f s): %s' % (clock(gap[0]), clock(gap[1]), (gap[1] - gap[0]) / 1000, why))
        for w, k, d in notable[:12]:
            print('    %s %s %s' % (clock(w), k, d[:160]))
        if len(notable) > 12:
            print('    ... %d more events' % (len(notable) - 12))
    print()


def report_web_export(path):
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    rounds = {r['id']: r for r in data.get('rounds', [])}
    print('## %s' % os.path.basename(path))
    print(HEADER)
    print(RULE)
    for rid, points in (data.get('tracks') or {}).items():
        r = rounds.get(rid) or rounds.get(rid.replace('-fixed', '')) or {}
        ts = [p[3] for p in points]
        accs = [p[2] for p in points]
        label = '%s %s (%s)' % (r.get('courseName', '?'), (r.get('startedAt') or '')[:10], rid[:10])
        print(row(label, coverage(ts, accs), '-'))
    print()


def walk(path, exclude_samples):
    if os.path.isfile(path) and path.lower().endswith('.json'):
        report_web_export(path)
        return
    if os.path.isfile(os.path.join(path, 'fixes.csv')):
        report_session(path, exclude_samples)
        return
    found = False
    for root, _, files in sorted(os.walk(path)):
        if 'fixes.csv' in files:
            found = True
            report_session(root, exclude_samples)
    if not found:
        print('nothing to score in %s' % path, file=sys.stderr)


# ---- self-test --------------------------------------------------------------

def self_test():
    expected = {}
    with open(os.path.join(FIXTURE_DIR, 'coverage-fixture.expected.properties'), encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#'):
                key, value = line.split('=', 1)
                expected[key.strip()] = value.strip()
    ts, accs, skipped, _ = read_fixes_csv(os.path.join(FIXTURE_DIR, 'coverage-fixture.csv'))
    c = coverage(ts, accs)
    # Edge gaps: START 30 s before the first fixture fix and STOP 10 s after the last
    # give exactly one edge gap (the leading 30 s); STOP at 21 s after gives two.
    first, last = min(ts), max(ts)
    checks = [
        ('fixes', c['fixes'] == int(expected['fixes'])),
        ('skipped', skipped == int(expected['skipped'])),
        ('span_ms', c['span_ms'] == int(expected['span_ms'])),
        ('covered_ms', c['covered_ms'] == int(expected['covered_ms'])),
        ('gaps_over_20s', len(c['gaps']) == int(expected['gaps_over_20s'])),
        ('longest_gap_ms', c['longest_gap_ms'] == int(expected['longest_gap_ms'])),
        ('median_acc_m', abs(c['median_acc_m'] - float(expected['median_acc_m'])) < 1e-9),
        ('covered_pct', abs(c['covered_pct'] - float(expected['covered_pct'])) < 5e-4),
        ('passes', passes(c) == (expected['passes'] == 'true')),
        ('edge_leading', edge_gaps(ts, first - 30_000, last + 10_000) == [(first - 30_000, first)]),
        ('edge_both', len(edge_gaps(ts, first - 30_000, last + 21_000)) == 2),
        ('edge_exactly_20s', edge_gaps(ts, first - 20_000, last + 20_000) == []),
        ('edge_no_fixes', edge_gaps([], 0, 60_000) == [(0, 60_000)]),
        ('edge_longest', with_edges(c, [(0, 90_000)])['longest_gap_ms'] == 90_000),
    ]
    for name, ok in checks:
        print('%-17s %s' % (name, 'ok' if ok else 'FAILED'))
    failed = [n for n, ok in checks if not ok]
    print('self-test: %d/%d' % (len(checks) - len(failed), len(checks)))
    return 1 if failed else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('paths', nargs='*')
    parser.add_argument('--exclude-samples', action='store_true',
                        help="score transistorsoft sessions without the SDK's intermediate samples")
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        sys.exit(self_test())
    if not args.paths:
        parser.print_help()
        sys.exit(2)
    for p in args.paths:
        walk(p, args.exclude_samples)


if __name__ == '__main__':
    main()
