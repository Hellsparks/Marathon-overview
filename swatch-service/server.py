#!/usr/bin/env python3
"""Minimal HTTP wrapper around swatch_generator.py."""

import json
import os
import sys
import tempfile
from http.server import BaseHTTPRequestHandler, HTTPServer

# Locate swatch_generator: same dir (Docker) or ../backend/src/services (local dev)
_here = os.path.dirname(os.path.abspath(__file__))
if os.path.exists(os.path.join(_here, 'swatch_generator.py')):
    _gen_dir = _here
else:
    _gen_dir = os.environ.get(
        'SWATCH_GENERATOR_DIR',
        os.path.join(_here, '..', 'backend', 'src', 'services'),
    )
if _gen_dir not in sys.path:
    sys.path.insert(0, _gen_dir)

import swatch_generator


class SwatchHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != '/swatch':
            self.send_response(404)
            self.end_headers()
            return

        length = int(self.headers.get('Content-Length', 0))
        body = json.loads(self.rfile.read(length))

        with tempfile.NamedTemporaryFile(suffix='.stl', delete=False) as f:
            tmp = f.name

        try:
            swatch_generator.generate(body.get('line1', ''), body.get('line2', ''), tmp)
            with open(tmp, 'rb') as f:
                data = f.read()
            self.send_response(200)
            self.send_header('Content-Type', 'application/octet-stream')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except Exception as e:
            msg = str(e).encode()
            self.send_response(500)
            self.send_header('Content-Type', 'text/plain')
            self.send_header('Content-Length', str(len(msg)))
            self.end_headers()
            self.wfile.write(msg)
        finally:
            try:
                os.unlink(tmp)
            except Exception:
                pass

    def log_message(self, fmt, *args):
        print(f'[swatch-service] {fmt % args}', flush=True)


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 7321))
    print(f'[swatch-service] Listening on port {port}', flush=True)
    HTTPServer(('0.0.0.0', port), SwatchHandler).serve_forever()
