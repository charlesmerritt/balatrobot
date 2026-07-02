"""Tests for the visualizer UI server (no Balatro instance required)."""

import json
from collections.abc import Iterator
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread

import httpx
import pytest

from balatrobot.ui.server import UPSTREAM_ERROR_CODE, UPSTREAM_ERROR_NAME, UIServer


class StubGameHandler(BaseHTTPRequestHandler):
    """Minimal stand-in for the Lua JSON-RPC server."""

    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length", 0))
        request = json.loads(self.rfile.read(length))
        body = json.dumps(
            {
                "jsonrpc": "2.0",
                "result": {"echo": request["method"]},
                "id": request["id"],
            }
        ).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:
        """Silence per-request logging."""


@pytest.fixture
def stub_game() -> Iterator[int]:
    """Run a stub game server on a random port, yielding the port."""
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), StubGameHandler)
    thread = Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    yield httpd.server_address[1]
    httpd.shutdown()
    httpd.server_close()


@pytest.fixture
def ui_server(stub_game: int) -> Iterator[UIServer]:
    """Run a UIServer proxying to the stub game server."""
    server = UIServer(port=0, game_port=stub_game)
    server.start()
    yield server
    server.stop()


def rpc(url: str, method: str = "health", request_id: int = 1) -> httpx.Response:
    payload = {"jsonrpc": "2.0", "method": method, "params": {}, "id": request_id}
    return httpx.post(f"{url}/rpc", json=payload)


class TestUIServer:
    def test_serves_index(self, ui_server: UIServer):
        """GET / returns the app shell."""
        response = httpx.get(ui_server.url)
        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]
        assert "balatrobot" in response.text.lower()

    def test_serves_static_assets(self, ui_server: UIServer):
        """GET /js/app.js returns the app module."""
        response = httpx.get(f"{ui_server.url}/js/app.js")
        assert response.status_code == 200

    def test_proxies_rpc_to_game_server(self, ui_server: UIServer):
        """POST /rpc forwards the JSON-RPC request and returns the response."""
        response = rpc(ui_server.url, method="gamestate", request_id=7)
        assert response.status_code == 200
        data = response.json()
        assert data["result"] == {"echo": "gamestate"}
        assert data["id"] == 7

    def test_post_outside_rpc_rejected(self, ui_server: UIServer):
        """POST to any other path is a 404."""
        response = httpx.post(f"{ui_server.url}/", json={})
        assert response.status_code == 404

    def test_upstream_down_returns_jsonrpc_error(self):
        """When the game server is unreachable, /rpc returns a JSON-RPC error."""
        server = UIServer(port=0, game_port=1)  # Nothing listens on port 1
        server.start()
        try:
            response = rpc(server.url, request_id=42)
            assert response.status_code == 200
            error = response.json()["error"]
            assert error["code"] == UPSTREAM_ERROR_CODE
            assert error["data"]["name"] == UPSTREAM_ERROR_NAME
            assert response.json()["id"] == 42
        finally:
            server.stop()

    def test_oversized_body_rejected(self, ui_server: UIServer):
        """Bodies beyond the Lua server limit are rejected with 413."""
        response = httpx.post(
            f"{ui_server.url}/rpc",
            content=b"x" * (64 * 1024 + 1),
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 413
