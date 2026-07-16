"""Tests for the offline visualizer fixture API."""

import json
from pathlib import Path

from balatrobot.ui.fixture_api import FixtureApi

ROOT = Path(__file__).parents[2]
SOURCE_CONTRACT = ROOT / "src/lua/utils/openrpc.json"
PACKAGED_CONTRACT = ROOT / "src/balatrobot/ui/static/fixtures/openrpc.json"
FIXTURE_STATES = ROOT / "src/balatrobot/ui/static/fixtures/gamestates.json"
SCREEN_STATES = {
    "MENU",
    "BLIND_SELECT",
    "SELECTING_HAND",
    "ROUND_EVAL",
    "SHOP",
    "SMODS_BOOSTER_OPENED",
    "GAME_OVER",
}


def request(method: str, params: dict | None = None, request_id: int = 1) -> bytes:
    return json.dumps(
        {"jsonrpc": "2.0", "method": method, "params": params or {}, "id": request_id}
    ).encode()


class TestFixtureAssets:
    def test_packaged_contract_matches_lua_contract(self):
        assert json.loads(PACKAGED_CONTRACT.read_text()) == json.loads(
            SOURCE_CONTRACT.read_text()
        )

    def test_contract_includes_every_endpoint(self):
        methods = {
            method["name"]
            for method in json.loads(PACKAGED_CONTRACT.read_text())["methods"]
        }
        assert "pack" in methods

    def test_gamestate_fixtures_cover_every_visualized_screen(self):
        states = json.loads(FIXTURE_STATES.read_text())["states"]
        assert set(states) == SCREEN_STATES
        for name, gamestate in states.items():
            assert gamestate["state"] == name
            assert gamestate["fixture"]["synthetic"] is True


class TestFixtureApi:
    def test_discover_returns_packaged_contract(self):
        api = FixtureApi()
        response = api.dispatch(request("rpc.discover"), "MENU")

        assert response["result"]["openrpc"] == "1.3.2"
        assert any(method["name"] == "pack" for method in response["result"]["methods"])

    def test_gamestate_endpoint_returns_selected_synthetic_fixture(self):
        api = FixtureApi()
        response = api.dispatch(request("gamestate", request_id=7), "SHOP")

        assert response["id"] == 7
        assert response["result"]["state"] == "SHOP"
        assert response["result"]["fixture"] == {
            "synthetic": True,
            "last_method": "gamestate",
        }

    def test_valid_endpoint_returns_fixture_without_simulating_transition(self):
        api = FixtureApi()
        response = api.dispatch(
            request("start", {"deck": "RED", "stake": "WHITE"}), "MENU"
        )

        assert response["result"]["state"] == "MENU"
        assert response["result"]["fixture"]["last_method"] == "start"

    def test_missing_required_parameter_returns_invalid_params(self):
        api = FixtureApi()
        response = api.dispatch(request("start", {"deck": "RED"}), "MENU")

        assert response["error"]["code"] == -32602
        assert response["error"]["data"]["name"] == "INVALID_PARAMS"
        assert "stake" in response["error"]["message"]

    def test_invalid_referenced_enum_returns_invalid_params(self):
        api = FixtureApi()
        response = api.dispatch(
            request("start", {"deck": "NOT_A_DECK", "stake": "WHITE"}), "MENU"
        )

        assert response["error"]["code"] == -32602
        assert "deck" in response["error"]["message"]

    def test_unknown_parameter_returns_invalid_params(self):
        api = FixtureApi()
        response = api.dispatch(request("health", {"extra": True}), "MENU")

        assert response["error"]["code"] == -32602
        assert "extra" in response["error"]["message"]

    def test_unknown_method_returns_method_not_found(self):
        api = FixtureApi()
        response = api.dispatch(request("not.real"), "MENU")

        assert response["error"]["code"] == -32601
        assert response["error"]["data"]["name"] == "METHOD_NOT_FOUND"

    def test_file_endpoint_returns_synthetic_path_result(self):
        api = FixtureApi()
        response = api.dispatch(request("save", {"path": "run.jkr"}), "MENU")

        assert response["result"] == {"success": True, "path": "run.jkr"}

    def test_unknown_fixture_state_returns_invalid_params(self):
        api = FixtureApi()
        response = api.dispatch(request("gamestate"), "DOES_NOT_EXIST")

        assert response["error"]["code"] == -32602
        assert "fixture state" in response["error"]["message"]
