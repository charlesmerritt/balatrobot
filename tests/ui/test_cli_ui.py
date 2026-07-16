"""Tests for visualizer CLI transport selection."""

import importlib

import pytest
import typer

ui_module = importlib.import_module("balatrobot.cli.ui")


class FakeServer:
    kwargs: dict[str, object] = {}
    served = False

    def __init__(self, **kwargs):
        type(self).kwargs = kwargs
        self.url = "http://127.0.0.1:12348"
        self.game_url = "http://127.0.0.1:12346/"

    def serve_forever(self):
        type(self).served = True


def test_fixture_mode_skips_game_health_check(monkeypatch):
    def unexpected_health_check(*args, **kwargs):
        pytest.fail("fixture mode must not health-check a game server")

    FakeServer.served = False
    monkeypatch.setattr(ui_module, "assert_game_reachable", unexpected_health_check)
    monkeypatch.setattr(ui_module, "UIServer", FakeServer)

    ui_module.ui(fixture=True)

    assert FakeServer.kwargs["initial_mode"] == "fixture"
    assert FakeServer.kwargs["record_graph"] is False
    assert FakeServer.served is True


def test_fixture_and_mock_modes_are_mutually_exclusive():
    with pytest.raises(typer.BadParameter):
        ui_module.ui(mock=True, fixture=True)
