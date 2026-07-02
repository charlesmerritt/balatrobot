# Gamestate Visualizer (`balatrobot ui`)

Design doc: `docs/superpowers/specs/2026-07-01-gamestate-visualizer-design.md`.
User docs: `docs/visualizer.md`.

## Layout

- `src/balatrobot/ui/server.py` — stdlib `ThreadingHTTPServer` serving
  `src/balatrobot/ui/static/` and proxying `POST /rpc` → game JSON-RPC server
  (httpx). Upstream failures become JSON-RPC error `-32099
  UPSTREAM_UNAVAILABLE` so the app can show connection status.
- `src/balatrobot/ui/static/js/` — vanilla ES modules, no build step:
  `mock.js` (mock game engine), `mockdata.js` (card/blind/schema tables),
  `rpc.js` (transport + log), `app.js` (poll/route), `components.js`,
  `inspector.js` (JSON tree/log/console/smoke tabs), `smoke.js` (endpoint
  smoke sequence), `screens/*.js` (one module per game screen).
- Tests: `tests/ui/test_server.py` (proxy + static serving; no game needed).

## Discoveries (verified against source)

- **No CORS on the Lua server** (`src/lua/core/server.lua`): browsers cannot
  call it directly; hence the `/rpc` proxy.
- **Endpoints return the fresh gamestate** as the JSON-RPC result (e.g.
  `select.lua`, `play.lua` send `BB_GAMESTATE.get_gamestate()`), so clients
  rarely need a follow-up `gamestate` call. The mock engine mirrors this.
- **`tests/fixtures/fixtures.json` contains setup recipes** (JSON-RPC call
  sequences to reach a state), not gamestate snapshots.
- **`rpc.discover` is implemented** in the dispatcher and serves
  `src/lua/utils/openrpc.json`. Note: that spec is missing the `pack` method
  (endpoint exists at `src/lua/endpoints/pack.lua`) — the mock's
  `rpc.discover` includes it.
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

## Mock engine fidelity notes

- Validation order mirrors the dispatcher: schema (`BAD_REQUEST`) → state
  (`INVALID_STATE`) → game rules (`NOT_ALLOWED`).
- Game math is approximate: flat/base joker effects only, all played cards
  score, shop odds simplified, subset of jokers/tarots/planets/spectrals/
  vouchers. Blind base chips per ante and hand base chips/mult follow the
  real tables.
- Smoke test: 28 steps covering all 21 endpoints; step 20 ("skip pack") is
  expected to SKIP when the pack already closed after its single pick.
