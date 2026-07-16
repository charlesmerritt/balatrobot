"""Tests for the visualizer UI server (no Balatro instance required)."""

import json
from collections.abc import Iterator
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

import httpx
import pytest

from balatrobot.ui.server import (
    UPSTREAM_ERROR_CODE,
    UPSTREAM_ERROR_NAME,
    GameServerUnavailable,
    UIServer,
    assert_game_reachable,
    game_url,
)

# Gamestate-shaped results so the proxy's graph recorder sees transitions.
STUB_RESULTS = {
    "gamestate": {"state": "MENU"},
    "start": {"state": "BLIND_SELECT"},
}


class StubGameHandler(BaseHTTPRequestHandler):
    """Minimal stand-in for the Lua JSON-RPC server."""

    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length", 0))
        request = json.loads(self.rfile.read(length))
        result = STUB_RESULTS.get(request["method"], {"echo": request["method"]})
        body = json.dumps(
            {
                "jsonrpc": "2.0",
                "result": result,
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
def ui_server(stub_game: int, tmp_path: Path) -> Iterator[UIServer]:
    """Run a UIServer proxying to the stub game server."""
    server = UIServer(
        port=0, game_port=stub_game, graph_path=tmp_path / "state_graph.json"
    )
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
        assert data["result"] == {"state": "MENU"}
        assert data["id"] == 7

    def test_fixture_rpc_returns_selected_fixture_without_game(
        self, ui_server: UIServer
    ):
        """POST /fixture-rpc validates calls and returns synthetic state."""
        response = httpx.post(
            f"{ui_server.url}/fixture-rpc",
            json={"jsonrpc": "2.0", "method": "gamestate", "params": {}, "id": 9},
            headers={"X-Balatrobot-Fixture-State": "SHOP"},
        )

        assert response.status_code == 200
        assert response.json()["result"]["state"] == "SHOP"
        assert response.json()["result"]["fixture"]["synthetic"] is True

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


class TestStateGraph:
    def test_config_reports_live_mode_by_default(self, ui_server: UIServer):
        """GET /config.json exposes the startup mode and graph URL."""
        config = httpx.get(f"{ui_server.url}/config.json").json()
        assert config == {"initialMode": "live", "graphUrl": "/state-graph.json"}

    @pytest.mark.parametrize("mode", ["mock", "fixture"])
    def test_config_reports_offline_mode(
        self, mode: str, stub_game: int, tmp_path: Path
    ):
        """A server started in an offline mode reports it to the browser."""
        server = UIServer(
            port=0,
            game_port=stub_game,
            initial_mode=mode,
            graph_path=tmp_path / "state_graph.json",
            record_graph=False,
        )
        server.start()
        try:
            config = httpx.get(f"{server.url}/config.json").json()
            assert config["initialMode"] == mode
        finally:
            server.stop()

    def test_state_graph_endpoint_serves_empty_graph_before_recording(
        self, ui_server: UIServer
    ):
        """GET /state-graph.json returns an empty graph when nothing was recorded."""
        graph = httpx.get(f"{ui_server.url}/state-graph.json").json()
        assert graph["nodes"] == {}
        assert graph["edges"] == []

    def test_proxy_records_live_state_transitions(self, ui_server: UIServer):
        """Successful proxied calls that change state become graph edges."""
        rpc(ui_server.url, method="gamestate")
        rpc(ui_server.url, method="start")

        graph = httpx.get(f"{ui_server.url}/state-graph.json").json()
        assert set(graph["nodes"]) == {"MENU", "BLIND_SELECT"}
        assert graph["current_state"] == "BLIND_SELECT"
        edge = graph["edges"][0]
        assert (edge["from"], edge["to"], edge["method"]) == (
            "MENU",
            "BLIND_SELECT",
            "start",
        )

    def test_recording_disabled_leaves_graph_empty(
        self, stub_game: int, tmp_path: Path
    ):
        """record_graph=False (mock mode) must not learn transitions."""
        server = UIServer(
            port=0,
            game_port=stub_game,
            graph_path=tmp_path / "state_graph.json",
            record_graph=False,
        )
        server.start()
        try:
            rpc(server.url, method="gamestate")
            rpc(server.url, method="start")
            graph = httpx.get(f"{server.url}/state-graph.json").json()
            assert graph["nodes"] == {}
            assert not (tmp_path / "state_graph.json").exists()
        finally:
            server.stop()


class TestGameReachability:
    def test_reachable_game_passes(self, stub_game: int):
        """A responding JSON-RPC server satisfies the live health check."""
        assert_game_reachable(game_url("127.0.0.1", stub_game))

    def test_unreachable_game_raises(self):
        """The live health check raises when nothing is listening."""
        with pytest.raises(GameServerUnavailable):
            assert_game_reachable(game_url("127.0.0.1", 1), timeout=0.2)
