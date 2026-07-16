#!/usr/bin/env bash
set -euo pipefail

dot_file="${1:-gamestate_graphs/state_graph.dot}"
svg_file="${2:-${dot_file%.dot}.svg}"

if [[ ! -f "$dot_file" ]]; then
  echo "DOT file not found: $dot_file" >&2
  echo "Run 'balatrobot ui' against a live game first to create it." >&2
  exit 1
fi

if ! command -v dot >/dev/null 2>&1; then
  echo "Graphviz 'dot' executable not found." >&2
  exit 1
fi

dot -Tsvg "$dot_file" -o "$svg_file"
echo "Wrote $svg_file"
