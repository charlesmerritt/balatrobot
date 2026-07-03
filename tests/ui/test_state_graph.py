"""Tests for learned gamestate graph recording."""

import json

from balatrobot.ui.state_graph import StateGraphRecorder, empty_graph, graph_to_dot


def read_graph(path):
    return json.loads(path.read_text(encoding="utf-8"))


def test_empty_graph_has_no_nodes_or_edges():
    graph = empty_graph()
    assert graph["nodes"] == {}
    assert graph["edges"] == []
    assert graph["current_state"] is None


def test_records_state_nodes_and_method_labeled_edges(tmp_path):
    path = tmp_path / "state_graph.json"
    recorder = StateGraphRecorder(path)

    recorder.record_response(method="gamestate", params={}, result={"state": "MENU"})
    recorder.record_response(
        method="start",
        params={"deck": "RED", "stake": "WHITE"},
        result={"state": "BLIND_SELECT"},
    )

    graph = read_graph(path)
    assert set(graph["nodes"]) == {"MENU", "BLIND_SELECT"}
    assert graph["current_state"] == "BLIND_SELECT"
    assert graph["edges"] == [
        {
            "count": 1,
            "first_seen_at": graph["edges"][0]["first_seen_at"],
            "from": "MENU",
            "last_seen_at": graph["edges"][0]["last_seen_at"],
            "method": "start",
            "to": "BLIND_SELECT",
        }
    ]
    assert (tmp_path / "state_graph.dot").exists()


def test_repeated_transition_updates_existing_edge_count(tmp_path):
    recorder = StateGraphRecorder(tmp_path / "state_graph.json")

    recorder.record_response(method="gamestate", params={}, result={"state": "MENU"})
    recorder.record_response(
        method="start", params={}, result={"state": "BLIND_SELECT"}
    )
    recorder.record_response(method="menu", params={}, result={"state": "MENU"})
    recorder.record_response(
        method="start", params={}, result={"state": "BLIND_SELECT"}
    )

    graph = read_graph(tmp_path / "state_graph.json")
    start_edge = next(edge for edge in graph["edges"] if edge["method"] == "start")
    assert start_edge["from"] == "MENU"
    assert start_edge["to"] == "BLIND_SELECT"
    assert start_edge["count"] == 2


def test_verbose_recording_stores_params_and_result_on_edges(tmp_path):
    recorder = StateGraphRecorder(tmp_path / "state_graph.json", verbose=True)

    recorder.record_response(method="gamestate", params={}, result={"state": "MENU"})
    recorder.record_response(
        method="start",
        params={"deck": "RED"},
        result={"state": "BLIND_SELECT", "ante": 1},
    )

    edge = read_graph(tmp_path / "state_graph.json")["edges"][0]
    assert edge["verbose"]["last_params"] == {"deck": "RED"}
    assert edge["verbose"]["last_result"] == {"state": "BLIND_SELECT", "ante": 1}
    assert len(edge["verbose"]["samples"]) == 1


def test_non_gamestate_results_are_ignored(tmp_path):
    path = tmp_path / "state_graph.json"
    recorder = StateGraphRecorder(path)

    assert (
        recorder.record_response(method="health", params={}, result={"ok": True})
        is False
    )
    assert not path.exists()


def test_graph_to_dot_marks_current_state():
    dot = graph_to_dot(
        {
            "nodes": {"MENU": {}, "BLIND_SELECT": {}},
            "edges": [
                {"from": "MENU", "to": "BLIND_SELECT", "method": "start", "count": 2}
            ],
            "current_state": "BLIND_SELECT",
        }
    )

    assert '"MENU" -> "BLIND_SELECT" [label="start ×2"]' in dot
    assert '"BLIND_SELECT" [fillcolor="#166534"]' in dot
