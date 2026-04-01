import argparse
import threading
import time
import webbrowser


def main():
    parser = argparse.ArgumentParser(
        prog="vidcompress",
        description="Local video compression powered by WebCodecs",
    )
    parser.add_argument(
        "-p", "--port", type=int, default=8899, help="Port to serve on (default: 8899)"
    )
    parser.add_argument(
        "--host", default="127.0.0.1", help="Host to bind to (default: 127.0.0.1)"
    )
    parser.add_argument(
        "--no-open", action="store_true", help="Don't open browser automatically"
    )
    parser.add_argument(
        "--version", action="version", version=f"%(prog)s {_get_version()}"
    )
    args = parser.parse_args()

    if not args.no_open:
        def _open():
            time.sleep(1.5)
            webbrowser.open(f"http://localhost:{args.port}")

        threading.Thread(target=_open, daemon=True).start()

    import uvicorn

    from vidcompress.server import app

    print(f"\n  VidCompress running at http://localhost:{args.port}\n")
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")


def _get_version():
    try:
        from vidcompress import __version__
        return __version__
    except ImportError:
        return "unknown"
