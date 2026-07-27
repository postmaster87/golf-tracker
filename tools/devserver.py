"""Static dev server that refuses to let the browser cache anything.

`python -m http.server` sends no cache headers at all, so browsers apply
heuristic caching to every module. During development that means an edit can
silently fail to take effect — and worse, a test run can report all-green while
executing code that no longer exists on disk. That happened repeatedly on this
project, including a suite that passed against a behaviour which had just been
deleted, which is the most dangerous possible failure for a test harness.

No-store on every response makes what the browser runs and what is on disk the
same thing, always. GitHub Pages sends proper validators, so production is
unaffected and still gets normal caching plus the service worker.

    python tools/devserver.py [port]
"""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import sys


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        # The default logs every asset; only surface problems.
        if not args or str(args[1]).startswith(("4", "5")):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
    print(f"golf-tracker dev server on http://localhost:{port}/ (caching disabled)")
    ThreadingHTTPServer(("", port), NoCacheHandler).serve_forever()
