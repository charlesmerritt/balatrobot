"""Static file server and JSON-RPC proxy for the gamestate visualizer UI.

The browser cannot call the game's JSON-RPC server directly (it sends no CORS
headers), so this server hosts the static app and forwards POST /rpc requests
to the game server over the same origin.
"""

import json
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

import httpx

STATIC_DIR = Path(__file__).parent / "static"
MAX_BODY_SIZE = 64 * 1024  # Same limit as the Lua server
PROXY_TIMEOUT = 30.0

UPSTREAM_ERROR_CODE = -32099
UPSTREAM_ERROR_NAME = "UPSTREAM_UNAVAILABLE"


def upstream_error(request_body: bytes, detail: str) -> dict[str, Any]:
    """Build a JSON-RPC error response for an unreachable game server."""
    request_id = None
    try:
        parsed = json.loads(request_body)
        if isinstance(parsed, dict):
            request_id = parsed.get("id")
    except json.JSONDecodeError:
        pass
    return {
        "jsonrpc": "2.0",
        "error": {
            "code": UPSTREAM_ERROR_CODE,
            "message": f"Game server unreachable: {detail}",
            "data": {"name": UPSTREAM_ERROR_NAME},
        },
        "id": request_id,
    }


class UIRequestHandler(SimpleHTTPRequestHandler):
    """Serves the visualizer static app and proxies /rpc to the game server."""

    def __init__(self, *args: Any, game_url: str, **kwargs: Any) -> None:
        self.game_url = game_url
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    def log_message(self, format: str, *args: Any) -> None:
        """Silence per-request logging."""

    def do_POST(self) -> None:
        if self.path != "/rpc":
            self.send_error(404, "POST only supported on /rpc")
            return
        length = int(self.headers.get("Content-Length", 0))
        if length > MAX_BODY_SIZE:
            self.send_error(413, "Request body too large")
            return
        body = self.rfile.read(length)
        try:
            with httpx.Client(timeout=PROXY_TIMEOUT) as client:
                response = client.post(
                    self.game_url,
                    content=body,
                    headers={"Content-Type": "application/json"},
                )
            payload = response.content
        except httpx.HTTPError as e:
            payload = json.dumps(upstream_error(body, str(e))).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


class UIServer:
    """Threaded HTTP server hosting the visualizer UI and /rpc proxy."""

    def __init__(
        self,
        host: str = "127.0.0.1",
        port: int = 12348,
        game_host: str = "127.0.0.1",
        game_port: int = 12346,
    ) -> None:
        self.host = host
        self.game_url = f"http://{game_host}:{game_port}/"
        handler = partial(UIRequestHandler, game_url=self.game_url)
        self._httpd = ThreadingHTTPServer((host, port), handler)
        self._thread: threading.Thread | None = None

    @property
    def port(self) -> int:
        """Actual bound port (useful when constructed with port=0)."""
        return self._httpd.server_address[1]

    @property
    def url(self) -> str:
        return f"http://{self.host}:{self.port}"

    def start(self) -> None:
        """Serve in a background thread."""
        self._thread = threading.Thread(target=self._httpd.serve_forever, daemon=True)
        self._thread.start()

    def serve_forever(self) -> None:
        """Serve in the current thread until interrupted."""
        self._httpd.serve_forever()

    def stop(self) -> None:
        self._httpd.shutdown()
        self._httpd.server_close()
        if self._thread is not None:
            self._thread.join(timeout=5)
            self._thread = None
