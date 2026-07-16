# BalatroBot Gamestate Visualizer — Design

**Date:** 2026-07-01
**Branch:** `feature/gamestate-visualizer`
**Status:** Approved for implementation (autonomous session — decisions documented in lieu of interactive approval)

## Goal

A browser-based visualizer/simulator that recreates the screens a Balatro player
sees — main menu, run setup (deck/stake select), blind select, gameplay, round
eval (cash out), shop, and booster pack — and binds every visual element to the
live game state returned by the BalatroBot JSON-RPC API. Each screen exposes
controls that exercise the API endpoints valid in that state, so the visualizer
doubles as an interactive endpoint test harness for the mod.

## Requirements

1. Recreate the player-visible screens listed above, styled after Balatro.
2. Visualize the *connection* between UI elements and the gamestate: hovering a
    card/counter highlights its JSON path in a gamestate inspector (and shows the
    path inline), so users can see exactly which part of the API response drives
    each pixel.
3. Hook into a running BalatroBot instance (live mode) and exercise all 21
    endpoints via per-screen controls plus a generic RPC console.
4. Work without the game (mock mode): an in-browser mock engine implements the
    same JSON-RPC methods with plausible state transitions and the same error
    semantics (`INVALID_STATE`, `BAD_REQUEST`, ...), so the UI and endpoint
    flows are testable headlessly.
5. A scripted endpoint smoke test that walks a full game loop and reports
    pass/fail per endpoint, runnable in either mode.

## Constraints discovered

- The Lua HTTP server (`src/lua/core/server.lua`) sends no CORS headers and
    does not handle `OPTIONS` preflight, so a browser page cannot POST JSON-RPC
    to it cross-origin. A same-origin proxy is required for live mode.
- `tests/fixtures/fixtures.json` contains *setup recipes* (JSON-RPC call
    sequences), not gamestate snapshots. The gamestate shape comes from
    `src/lua/utils/types.lua` (`GameState`, `Area`, `Card`, `Blind`, `Round`,
    `Hand`) and `src/lua/utils/openrpc.json`.
- Endpoint → required-state map (from `requires_state` in each endpoint):
    `start`=MENU; `select`/`skip`=BLIND_SELECT; `play`/`discard`=SELECTING_HAND;
    `cash_out`=ROUND_EVAL; `buy`/`reroll`/`next_round`=SHOP; `pack`=
    SMODS_BOOSTER_OPENED; `sell`/`use`=SELECTING_HAND|SHOP; `rearrange`=
    SELECTING_HAND|SHOP|SMODS_BOOSTER_OPENED; `add`=SELECTING_HAND|SHOP|ROUND_EVAL;
    `save`=(in-run states); `menu`/`load`/`set`/`gamestate`/`health`/`screenshot`=any.

## Approaches considered

**A. Vanilla JS SPA + stdlib Python proxy (chosen).** A static single-page app
served by a small `ThreadingHTTPServer` that also proxies `POST /rpc` to the
game (httpx is already a dependency). No new Python deps, no JS toolchain, no
build step; packaged inside `src/balatrobot/ui/` so hatchling ships it and
`balatrobot ui` works from any install.

**B. FastAPI/uvicorn app with server-side rendering or websockets.** Nicer
streaming, but adds two dependencies and server-side state for what is
fundamentally a poll-and-render UI. Rejected: the Lua API is poll-based anyway.

**C. Desktop TUI (textual).** Cannot faithfully recreate Balatro's screens or
serve screenshots/visual review. Rejected.

Mock engine placement: in the browser (JS) rather than in the proxy, so the
whole UI works even when served by any static file server, and live/mock modes
share the exact same rendering and control code paths.

## Architecture

```
browser (SPA) ──POST /rpc──> balatrobot ui proxy ──JSON-RPC──> Balatro (mod)
     │                            (stdlib http.server + httpx)
     └── mock mode: js/mock.js implements the same 21 methods in-page
```

### Python (`src/balatrobot/ui/`)

- `server.py` — `UIServer`: serves `static/` (GET) and proxies `/rpc` (POST)
    to `http://{game_host}:{game_port}/`. Upstream connection errors map to a
    JSON-RPC error response (code -32099, name `UPSTREAM_UNAVAILABLE`) so the UI
    can render connection status rather than a network failure.
- `src/balatrobot/cli/ui.py` — `balatrobot ui` command: `--host/--port` (UI,
    default 127.0.0.1:12348), `--game-host/--game-port` (default 127.0.0.1:12346),
    `--open` (open browser).

### Static app (`src/balatrobot/ui/static/`)

ES modules, no external assets:

- `index.html` — app shell: screen area + inspector side panel.
- `css/style.css` — Balatro-styled theme (dark felt, chunky buttons, card
    sprites drawn with CSS).
- `js/rpc.js` — transport: live (`fetch('/rpc')`) or mock (`mock.js`), plus a
    request/response log with listeners.
- `js/mock.js` — mock game engine: full `GameState` per `types.lua`, seeded
    deck, state transitions for all 21 methods, `requires_state` validation and
    JSON-RPC error objects matching the Lua dispatcher.
- `js/app.js` — gamestate polling (1s live / event-driven mock), screen router
    on `gamestate.state`, connection status.
- `js/components.js` — shared renderers: playing cards, jokers, consumables,
    chips/mult counters, `data-path` binding helper.
- `js/screens/menu.js`, `setup.js` (deck/stake), `blinds.js`, `play.js`,
    `roundeval.js`, `shop.js`, `pack.js`, `gameover.js`.
- `js/inspector.js` — gamestate JSON tree with path highlighting (two-way with
    `data-path` hover), RPC log view, endpoint console (forms generated from the
    OpenRPC spec), smoke-test runner.
- OpenRPC spec acquisition: the Lua server already exposes `rpc.discover`, so
    live mode fetches the canonical spec over the same JSON-RPC channel; mock
    mode's `rpc.discover` returns the mock's own method table. No spec file is
    copied into the package (`src/lua` is not shipped in the wheel).

### Data flow

Poll `gamestate` → normalize → route to screen renderer → renderers attach
`data-path="hand.cards.3"` attributes → inspector mirrors hover both ways.
Every action button calls `rpc.call(method, params)`; responses (success or
error) land in the RPC log; a gamestate refresh follows every call.

### Error handling

- Upstream down (live): banner with retry; mock mode unaffected.
- JSON-RPC errors: shown as toasts and logged with the request in the console;
    `INVALID_STATE` errors are expected artifacts of testing and rendered
    distinctly (yellow), not as failures.

### Testing

- `tests/cli/test_ui.py` (no game needed, not marked `integration`): UIServer
    serves index and static assets; `/rpc` proxies to a stub upstream; upstream-
    down produces the `UPSTREAM_UNAVAILABLE` JSON-RPC error; non-POST to `/rpc`
    rejected.
- Browser smoke test (dev-time, via chrome-devtools): load in mock mode, walk
    all screens, run the endpoint smoke test, expect 21/21 pass.

## Out of scope

- Pixel-perfect asset reproduction (no game assets are copied; the look is
    CSS-only homage).
- Websocket push, multi-client sessions, replay recording.
- Modifying the Lua server (e.g., adding CORS) — the proxy avoids touching the
    mod's HTTP stack.
