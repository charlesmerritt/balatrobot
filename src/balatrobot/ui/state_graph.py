"""Gamestate transition graph recording for the visualizer.

The graph is intentionally coarse by default: each node is a BalatroBot
``gamestate.state`` enum value and each edge is an observed successful RPC method
that moved the live game from one state to another. This keeps mock mode honest:
it can only replay transitions observed from a real Balatro run.
"""

from __future__ import annotations

import json
import threading
from copy import deepcopy
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

GRAPH_VERSION = 1
DEFAULT_GRAPH_PATH = Path("gamestate_graphs/state_graph.json")
MAX_VERBOSE_SAMPLES = 10


def empty_graph() -> dict[str, Any]:
    """Return a new empty gamestate graph document."""
    return {
        "version": GRAPH_VERSION,
        "kind": "balatrobot-gamestate-transition-graph",
        "description": (
            "Nodes are gamestate.state enum values observed from a live game. "
            "Edges are successful RPC methods that changed state."
        ),
        "nodes": {},
        "edges": [],
        "current_state": None,
    }


def graph_to_dot(graph: dict[str, Any]) -> str:
    """Render a graph document to Graphviz DOT."""
    lines = [
        "digraph balatrobot_gamestate {",
        "  rankdir=LR;",
        '  node [shape=box, style="rounded,filled", fillcolor="#1f2937", fontcolor="#f8fafc"];',
        '  edge [color="#facc15", fontcolor="#f8fafc"];',
    ]
    nodes = graph.get("nodes", {})
    for state in sorted(nodes):
        attrs = []
        if state == graph.get("current_state"):
            attrs.append('fillcolor="#166534"')
        attr_text = f" [{', '.join(attrs)}]" if attrs else ""
        lines.append(f'  "{_dot_escape(state)}"{attr_text};')
    for edge in sorted(
        graph.get("edges", []),
        key=lambda e: (
            str(e.get("from", "")),
            str(e.get("to", "")),
            str(e.get("method", "")),
        ),
    ):
        label = str(edge.get("method", "?"))
        count = edge.get("count", 1)
        if count != 1:
            label = f"{label} ×{count}"
        lines.append(
            f'  "{_dot_escape(str(edge.get("from", "")))}" -> '
            f'"{_dot_escape(str(edge.get("to", "")))}" '
            f'[label="{_dot_escape(label)}"];'
        )
    lines.append("}")
    return "\n".join(lines) + "\n"


class StateGraphRecorder:
    """Persist observed live gamestate transitions to JSON and DOT files."""

    def __init__(
        self, path: Path = DEFAULT_GRAPH_PATH, *, verbose: bool = False
    ) -> None:
        self.path = path
        self.verbose = verbose
        self._lock = threading.Lock()
        self._session_state: str | None = None

    @property
    def dot_path(self) -> Path:
        """DOT file generated next to the JSON graph."""
        return self.path.with_suffix(".dot")

    def read(self) -> dict[str, Any]:
        """Read the graph from disk, returning an empty graph if it does not exist."""
        if not self.path.exists():
            return empty_graph()
        try:
            graph = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return empty_graph()
        return self._normalize(graph)

    def record_response(self, *, method: str, params: Any, result: Any) -> bool:
        """Record a successful RPC result if it contains a gamestate state.

        Returns True when a graph file was written.
        """
        state = self._state_from_result(result)
        if state is None:
            return False
        with self._lock:
            graph = self.read()
            now = _now()
            self._touch_node(graph, state, now)
            previous = self._session_state
            self._session_state = state
            graph["current_state"] = state
            if previous is not None and previous != state:
                self._touch_edge(
                    graph,
                    from_state=previous,
                    to_state=state,
                    method=method,
                    params=params,
                    result=result,
                    now=now,
                )
            self._write(graph)
            return True

    def _normalize(self, graph: dict[str, Any]) -> dict[str, Any]:
        normalized = empty_graph()
        if isinstance(graph.get("nodes"), dict):
            normalized["nodes"] = graph["nodes"]
        if isinstance(graph.get("edges"), list):
            normalized["edges"] = graph["edges"]
        if isinstance(graph.get("current_state"), str):
            normalized["current_state"] = graph["current_state"]
        return normalized

    def _touch_node(self, graph: dict[str, Any], state: str, now: str) -> None:
        nodes = graph.setdefault("nodes", {})
        node = nodes.setdefault(
            state,
            {"id": state, "first_seen_at": now, "last_seen_at": now, "seen_count": 0},
        )
        node["last_seen_at"] = now
        node["seen_count"] = int(node.get("seen_count", 0)) + 1

    def _touch_edge(
        self,
        graph: dict[str, Any],
        *,
        from_state: str,
        to_state: str,
        method: str,
        params: Any,
        result: Any,
        now: str,
    ) -> None:
        for edge in graph.setdefault("edges", []):
            if (
                edge.get("from") == from_state
                and edge.get("to") == to_state
                and edge.get("method") == method
            ):
                edge["count"] = int(edge.get("count", 0)) + 1
                edge["last_seen_at"] = now
                if self.verbose:
                    self._record_verbose(edge, params=params, result=result, now=now)
                return
        edge = {
            "from": from_state,
            "to": to_state,
            "method": method,
            "count": 1,
            "first_seen_at": now,
            "last_seen_at": now,
        }
        if self.verbose:
            self._record_verbose(edge, params=params, result=result, now=now)
        graph["edges"].append(edge)

    def _record_verbose(
        self, edge: dict[str, Any], *, params: Any, result: Any, now: str
    ) -> None:
        verbose = edge.setdefault("verbose", {})
        verbose["last_params"] = deepcopy(params)
        verbose["last_result"] = deepcopy(result)
        samples = verbose.setdefault("samples", [])
        samples.append(
            {"at": now, "params": deepcopy(params), "result": deepcopy(result)}
        )
        del samples[:-MAX_VERBOSE_SAMPLES]

    def _write(self, graph: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(
            json.dumps(graph, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        self.dot_path.write_text(graph_to_dot(graph), encoding="utf-8")

    @staticmethod
    def _state_from_result(result: Any) -> str | None:
        if not isinstance(result, dict):
            return None
        state = result.get("state")
        if not isinstance(state, str) or not state:
            return None
        return state


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def _dot_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')
