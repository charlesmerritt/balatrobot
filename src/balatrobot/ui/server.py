"""Static file server and JSON-RPC proxy for the gamestate visualizer UI.

The browser cannot call the game's JSON-RPC server directly (it sends no CORS
headers), so this server hosts the static app and forwards POST /rpc requests
to the game server over the same origin.
"""

import json
import sys
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx

from balatrobot.ui.state_graph import DEFAULT_GRAPH_PATH, StateGraphRecorder

STATIC_DIR = Path(__file__).parent / "static"
MAX_BODY_SIZE = 64 * 1024  # Same limit as the Lua server
PROXY_TIMEOUT = 30.0

UPSTREAM_ERROR_CODE = -32099
UPSTREAM_ERROR_NAME = "UPSTREAM_UNAVAILABLE"


class GameServerUnavailable(RuntimeError):
    """Raised when the UI is asked to require a live game and none responds."""


def game_url(game_host: str, game_port: int) -> str:
    """Build the BalatroBot JSON-RPC URL for a game host/port pair."""
    return f"http://{game_host}:{game_port}/"


def assert_game_reachable(url: str, *, timeout: float = 5.0) -> None:
    """Raise if the game JSON-RPC health endpoint does not respond cleanly."""
    payload = {"jsonrpc": "2.0", "method": "health", "params": {}, "id": 1}
    try:
        response = httpx.post(url, json=payload, timeout=timeout)
        response.raise_for_status()
        data = response.json()
    except (httpx.HTTPError, json.JSONDecodeError) as e:
        raise GameServerUnavailable(f"No game server reachable at {url}: {e}") from e
    if isinstance(data, dict) and "error" in data:
        raise GameServerUnavailable(
            f"Game server health check failed at {url}: {data['error']}"
        )


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

    def __init__(
        self,
        *args: Any,
        game_url: str,
        initial_mode: str,
        state_graph: StateGraphRecorder,
        record_graph: bool,
        **kwargs: Any,
    ) -> None:
        self.game_url = game_url
        self.initial_mode = initial_mode
        self.state_graph = state_graph
        self.record_graph = record_graph
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    def log_message(self, format: str, *args: Any) -> None:
        """Silence per-request logging."""

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/config.json":
            self._send_json(
                {"initialMode": self.initial_mode, "graphUrl": "/state-graph.json"}
            )
            return
        if path == "/state-graph.json":
            self._send_json(self.state_graph.read())
            return
        super().do_GET()

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
            self._record_live_response(body, payload)
        except httpx.HTTPError as e:
            payload = json.dumps(upstream_error(body, str(e))).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _send_json(self, payload: dict[str, Any]) -> None:
        body = json.dumps(payload).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _record_live_response(self, request_body: bytes, response_body: bytes) -> None:
        if not self.record_graph:
            return
        try:
            request = json.loads(request_body)
            response = json.loads(response_body)
            if not isinstance(request, dict) or not isinstance(response, dict):
                return
            if "error" in response:
                return
            method = request.get("method")
            if not isinstance(method, str):
                return
            self.state_graph.record_response(
                method=method,
                params=request.get("params", {}),
                result=response.get("result"),
            )
        except Exception as e:  # pragma: no cover - recording must not break proxying
            print(f"State graph recording failed: {e}", file=sys.stderr)


class UIServer:
    """Threaded HTTP server hosting the visualizer UI and /rpc proxy."""

    def __init__(
        self,
        host: str = "127.0.0.1",
        port: int = 12348,
        game_host: str = "127.0.0.1",
        game_port: int = 12346,
        *,
        initial_mode: str = "live",
        graph_path: Path = DEFAULT_GRAPH_PATH,
        record_graph: bool = True,
        verbose_graph: bool = False,
    ) -> None:
        self.host = host
        self.game_url = game_url(game_host, game_port)
        self.initial_mode = initial_mode
        self.state_graph = StateGraphRecorder(graph_path, verbose=verbose_graph)
        handler = partial(
            UIRequestHandler,
            game_url=self.game_url,
            initial_mode=initial_mode,
            state_graph=self.state_graph,
            record_graph=record_graph,
        )
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
