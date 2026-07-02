# Gamestate Visualizer

A browser-based visualizer that recreates Balatro's screens — main menu, run
setup (deck/stake), blind select, gameplay, round eval, shop, and booster
pack — and binds every visual element to the game state returned by the
BalatroBot API. It doubles as an interactive test harness for all API
endpoints.

![Gameplay screen](assets/visualizer-gameplay.png)

## Quick start

```bash
# Serve the visualizer (defaults: UI on 127.0.0.1:12348, game on 12346)
uvx balatrobot ui --open

# Or point it at a game running on another port
uvx balatrobot ui --game-port 22222
```

Then pick a transport mode in the top bar:

- **Mock engine** (default): an in-browser simulation of the game implementing
    all API methods with the same schemas, state requirements, and error codes
    (`BAD_REQUEST`, `INVALID_STATE`, `NOT_ALLOWED`). No game needed — useful for
    exploring the API surface and prototyping bot logic.
- **Live game**: JSON-RPC calls are proxied to a running
    `balatrobot serve` instance. The game's HTTP server sends no CORS headers,
    so the visualizer server forwards `POST /rpc` on the browser's behalf.

## What's on screen

- **Game screens**: each game state routes to a recreation of the screen a
    player would see. Buttons on each screen call the endpoints that are valid
    in that state (`select`/`skip` on blind select, `play`/`discard`/`use`/
    `sell`/`rearrange` during play, `buy`/`reroll`/`next_round` in the shop,
    `pack` in an opened booster, `cash_out` on round eval, `start` from the
    menu).
- **Gamestate tab**: live JSON tree of the `gamestate` response. Hover any
    card, counter, or area on the screen to highlight the exact JSON path that
    drives it (and vice versa: hover a JSON node to highlight the matching
    screen elements).
- **Log tab**: every JSON-RPC request/response with timing and error names.
- **Console tab**: form-based caller for any endpoint; the method list and
    parameters come from `rpc.discover`.
- **Smoke Test tab**: a scripted sequence that walks a full game loop and
    exercises every endpoint, reporting pass/fail per step. Runs against the
    mock engine or, in live mode, the real game.

## Scripting hook

`window.__bbviz.ctx.call(method, params)` drives the UI programmatically from
the browser console or automation tooling and re-renders after each call.

## Caveats

- The mock engine approximates game math (scoring, shop odds, a subset of
    jokers/consumables). It is a UI/API test double, not a Balatro reimplementation.
- The visualizer server binds to localhost by default; it is a development
    tool and has no authentication.
