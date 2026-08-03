#!/usr/bin/env python3
"""
Check that every quotation in a doc is a literal substring of what Matt typed.

Why this exists
---------------
docs/HANDOFF.md was first written from a context summary. It attributed two
quotations to Matt that he never said - one of them was my own prose, fed back
through a summary and re-attributed. A summary preserves conclusions while
dropping the evidence, so a claim keeps its confidence after losing its basis.
This turns "is that really what he said" into one command.

Usage
-----
    python tools/verify-quotes.py <transcript.jsonl> [doc.md ...]

Defaults to docs/HANDOFF.md. Exit status is the number of unverified quotes,
so it can gate a commit.

Two traps this encodes, both of which cost a wrong answer when discovered
by hand:

  1. Matt's typed input is NOT only in `type: "user"` records. Queued messages
     land under `type: "queue-operation"`, and answers to AskUserQuestion arrive
     as tool_result blocks. An extractor reading only user turns silently
     reports genuine quotes as fabricated.

  2. The corpus must EXCLUDE the compaction summary and all other tool_result
     content. Both contain my own prose - including earlier drafts of the very
     doc being checked - so a fabricated quote would happily match itself.
"""

import json
import io
import re
import sys
import os

# Lines starting with this heading mark the compaction summary: my prose, not his.
SUMMARY_MARKER = "## 1. Primary Request and Intent"

# Quotes under this heading are deliberately-false claims being catalogued as
# false, so they are expected NOT to appear in the corpus.
EXCLUDE_FROM = "## 10. Claims that were asserted and are false"


def build_corpus(path):
    """Every piece of text Matt actually typed, and nothing else."""
    recs = []
    with io.open(path, "r", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                recs.append(json.loads(line))
            except ValueError:
                pass

    # Only AskUserQuestion tool_results carry his words; every other tool_result
    # is file content or command output.
    ask_ids = set()
    for r in recs:
        if r.get("type") != "assistant":
            continue
        content = (r.get("message") or {}).get("content")
        if isinstance(content, list):
            for part in content:
                if (isinstance(part, dict) and part.get("type") == "tool_use"
                        and part.get("name") == "AskUserQuestion"):
                    ask_ids.add(part.get("id"))

    chunks = []
    for r in recs:
        kind = r.get("type")

        # Trap 1: queued input is its own record type.
        if kind == "queue-operation":
            c = r.get("content")
            if isinstance(c, str) and c.strip():
                chunks.append(c)
            continue

        if kind != "user" or r.get("isCompactSummary"):
            continue

        content = (r.get("message") or {}).get("content")
        parts = []
        if isinstance(content, str):
            parts.append(content)
        elif isinstance(content, list):
            for part in content:
                if not isinstance(part, dict):
                    continue
                if part.get("type") == "text":
                    parts.append(part.get("text", ""))
                elif (part.get("type") == "tool_result"
                      and part.get("tool_use_id") in ask_ids):
                    inner = part.get("content")
                    if isinstance(inner, str):
                        parts.append(inner)
                    elif isinstance(inner, list):
                        for q in inner:
                            if isinstance(q, dict) and q.get("type") == "text":
                                parts.append(q.get("text", ""))

        text = "\n".join(parts)
        if SUMMARY_MARKER in text:   # trap 2
            continue
        if text.strip():
            chunks.append(text)

    return "\n\n".join(chunks)


def norm(s):
    """Fold the typography a markdown doc applies but a chat message does not."""
    for a, b in (("’", "'"), ("‘", "'"), ("“", '"'),
                 ("”", '"'), ("—", "-"), ("–", "-")):
        s = s.replace(a, b)
    return re.sub(r"\s+", " ", s).strip()


def extract_quotes(doc_text):
    body = doc_text.split(EXCLUDE_FROM)[0]
    quotes = []
    for m in re.finditer(r"(?:^> .*\n)+", body, re.M):
        block = " ".join(l[2:] for l in m.group(0).strip().split("\n"))
        quotes.append(("blockquote", block))
    for m in re.finditer(r'\*"([^"]{12,})"\*', body):
        quotes.append(("inline", m.group(1)))
    return quotes


def longest_prefix(needle, haystack):
    lo, hi = 0, len(needle)
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if needle[:mid] in haystack:
            lo = mid
        else:
            hi = mid - 1
    return lo


def main(argv):
    if len(argv) < 2:
        print(__doc__.strip())
        return 2

    transcript = argv[1]
    docs = argv[2:] or [os.path.join("docs", "HANDOFF.md")]

    corpus = norm(build_corpus(transcript))
    print("corpus: %d chars of Matt's own input\n" % len(corpus))

    failures = 0
    checked = 0
    for doc in docs:
        text = io.open(doc, "r", encoding="utf-8").read()
        for kind, quote in extract_quotes(text):
            checked += 1
            q = norm(quote).strip('"')
            if q in corpus:
                continue
            failures += 1
            n = longest_prefix(q, corpus)
            at = corpus.find(q[:n]) if n else -1
            print("UNVERIFIED  %s  [%s]" % (doc, kind))
            print("  matches the first %d of %d chars" % (n, len(q)))
            print("  doc says : ...%r" % q[max(0, n - 55):n + 25])
            if at >= 0:
                print("  he wrote : ...%r" % corpus[max(0, at + n - 55):at + n + 25])
            print("")

    print("%d quotes checked, %d unverified" % (checked, failures))
    return failures


if __name__ == "__main__":
    sys.exit(main(sys.argv))
