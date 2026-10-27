"""Serve only the public prototype directory on loopback; no business services."""

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description="Local, mock-only topic workbench")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    public = Path(__file__).resolve().parent / "public"
    handler = partial(SimpleHTTPRequestHandler, directory=str(public))
    with ThreadingHTTPServer(("127.0.0.1", args.port), handler) as server:
        print(f"Mock prototype: http://127.0.0.1:{args.port} (Ctrl+C to stop)", flush=True)
        server.serve_forever()


if __name__ == "__main__":
    main()
