# Gamestate Visualizer (`balatrobot ui`)

Design doc: `docs/superpowers/specs/2026-07-01-gamestate-visualizer-design.md`.
User docs: `docs/visualizer.md`.

## Layout

- `src/balatrobot/ui/server.py` — stdlib `ThreadingHTTPServer` serving
    `src/balatrobot/ui/static/`, proxying `POST /rpc` → game JSON-RPC server
    (httpx), and dispatching offline `POST /fixture-rpc`. Upstream failures
    become JSON-RPC error `-32099 UPSTREAM_UNAVAILABLE` so the app can show
    connection status. Also serves `/config.json` (startup mode) and
    `/state-graph.json` (learned graph), and records live transitions via
    `state_graph.py` when `record_graph=True`.
- `src/balatrobot/ui/fixture_api.py` — validates fixture calls against the
    packaged OpenRPC contract and returns selected synthetic gamestates. Assets
    are under `src/balatrobot/ui/static/fixtures/`.
- `src/balatrobot/ui/state_graph.py` — `StateGraphRecorder` persists observed
    `gamestate.state` transitions (nodes = states, edges = successful RPC
    methods that changed state) to `gamestate_graphs/state_graph.json` + `.dot`.
- `src/balatrobot/ui/static/js/` — vanilla ES modules, no build step:
    `mock.js` (graph-backed replay transport, not a game simulation),
    `mockdata.js` (deck/stake constants for the setup screen only),
    `rpc.js` (transport + log; `init()` fetches `/config.json` and the graph),
    `app.js` (poll/route), `components.js`, `inspector.js` (JSON
    tree/log/console/smoke tabs), `smoke.js` (endpoint smoke sequence),
    `screens/*.js` (one module per game screen).
- Tests: `tests/ui/test_server.py` (proxy, fixture/config/graph endpoints,
    recording; no game needed), `tests/ui/test_fixture_api.py` (contract
    validation + asset synchronization), `tests/ui/test_cli_ui.py` (offline
    mode selection), and `tests/ui/test_state_graph.py` (recorder + DOT export).

## Discoveries (verified against source)

- **No CORS on the Lua server** (`src/lua/core/server.lua`): browsers cannot
    call it directly; hence the `/rpc` proxy.
- **Endpoints return the fresh gamestate** as the JSON-RPC result (e.g.
    `select.lua`, `play.lua` send `BB_GAMESTATE.get_gamestate()`), so clients
    rarely need a follow-up `gamestate` call. The mock engine mirrors this.
- **`tests/fixtures/fixtures.json` contains setup recipes** (JSON-RPC call
    sequences to reach a state), not gamestate snapshots.
- **`rpc.discover` is implemented** in the dispatcher and serves
    `src/lua/utils/openrpc.json`. The `pack` method is included. Fixture mode
    uses a packaged copy at `static/fixtures/openrpc.json`; a test requires the
    source and packaged contracts to remain identical.
- **`tests/cli/conftest.py` starts real Balatro instances in
    `pytest_configure`** for any run touching `tests/cli`, even with
    `-m "not integration"`. On machines without a working launcher (e.g. Linux,
    where the launcher is unimplemented) any `pytest tests/cli` run aborts.
    That's why the visualizer tests live in `tests/ui/`.
- **Wheel contents**: no `[tool.hatch]` config, so only `src/balatrobot/` is
    packaged. `src/lua/` (including `openrpc.json`) does not ship in the wheel —
    don't reference it from Python at runtime.

## Dev environment gotchas

- `make quality`/`make test` need the project venv on PATH:
    `PATH="$PWD/.venv/bin:$PATH" make quality`. A PostToolUse hook that runs
    bare `make quality` fails with `python: not found` on systems where only
    `python3` exists and the venv isn't activated (the Makefile shells out to
    `python` and bare `ty`/`ruff`).
- Browser testing headlessly: puppeteer's chrome-headless-shell may exist as
    an unextracted zip under `~/.cache/puppeteer` — unzip before pointing
    `puppeteer-core` at it.

## Graph-backed mock (2026-07-02 redesign)

The original in-browser mock engine simulated Balatro (hand scoring, shop,
jokers, endpoint schemas) from hand-authored tables in `mockdata.js`. That
invented game structure the project couldn't vouch for, so it was replaced:

- **Live is the default.** `balatrobot ui` health-checks the game at startup
    and raises `GameServerUnavailable` if nothing responds; `--mock` is an
    explicit opt-in.
- **Live play teaches the graph.** The `/rpc` proxy records every successful
    response carrying `gamestate.state` (nodes = states, edges = the methods
    that changed state; `--verbose` adds last params/results + samples per
    edge, capped at 10). Learning only happens without `--mock`.
- **Mock replays the graph.** `--mock` (or the top-bar toggle) loads
    `/state-graph.json`; an empty/missing graph makes every call fail with
    `MOCK_GRAPH_EMPTY` (-32110), and methods without a learned edge from the
    current state fail with `MOCK_TRANSITION_UNKNOWN`. Mock gamestates are
    minimal (`{state, mock: true, graph: {...}}`); screens tolerate this
    because they use optional chaining throughout.
- Graph files live in `gamestate_graphs/` (JSON + DOT + `render_svg.sh`),
    intentionally not gitignored for now.
- Smoke test (`smoke.js`) still targets the full endpoint surface — useful in
    live mode; in mock mode steps fail unless their transitions were learned.

## Fixture contract mode (2026-07-03)

- `balatrobot ui --fixture` skips the game health check, disables graph
    recording, and starts the browser in `fixture` transport mode.
- The top bar exposes all seven visualized synthetic gamestates directly;
    endpoint calls never mutate them or pretend to simulate Balatro.
- `/fixture-rpc` validates method names and OpenRPC parameter schemas. It
    returns the selected gamestate for game-state methods, `{status: "ok"}` for
    health, and synthetic path results for save/load/screenshot.
- The Console tab is the fixture API test surface. The full game-loop smoke
    test is disabled because fixture mode intentionally has no transitions.
- `--fixture` and `--mock` are mutually exclusive; live remains the default.
