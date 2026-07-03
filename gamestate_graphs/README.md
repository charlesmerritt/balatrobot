# Gamestate graphs

`balatrobot ui` records learned gamestate transitions here by default:

- `state_graph.json` — source graph data
- `state_graph.dot` — Graphviz DOT view generated next to the JSON
- `state_graph.svg` — optional rendered output

The graph starts empty. Run the visualizer against a real BalatroBot game
(without `--mock`) to learn transitions from live `gamestate` responses. Mock
mode (`balatrobot ui --mock`) reads this graph and only replays transitions that
were observed from the real game.

Render the DOT file to SVG with Graphviz:

```bash
./gamestate_graphs/render_svg.sh
```
