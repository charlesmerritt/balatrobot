"""UI command - Serve the gamestate visualizer web app."""

import webbrowser
from pathlib import Path
from typing import Annotated

import typer

from balatrobot.ui.server import UIServer, assert_game_reachable, game_url
from balatrobot.ui.state_graph import DEFAULT_GRAPH_PATH


def ui(
    # fmt: off
    host: Annotated[str, typer.Option(help="UI server hostname")] = "127.0.0.1",
    port: Annotated[int, typer.Option(help="UI server port")] = 12348,
    game_host: Annotated[str, typer.Option(help="Game server hostname")] = "127.0.0.1",
    game_port: Annotated[int, typer.Option(help="Game server port")] = 12346,
    open_browser: Annotated[
        bool, typer.Option("--open/--no-open", help="Open the UI in a browser")
    ] = False,
    mock: Annotated[
        bool,
        typer.Option(
            "--mock/--no-mock",
            help="Use graph-backed mock mode and do not require a live game",
        ),
    ] = False,
    graph: Annotated[
        Path,
        typer.Option(help="Gamestate transition graph JSON path"),
    ] = DEFAULT_GRAPH_PATH,
    verbose: Annotated[
        bool,
        typer.Option(
            "--verbose/--compact",
            help="Store verbose params/results on recorded graph edges",
        ),
    ] = False,
    health_timeout: Annotated[
        float,
        typer.Option(help="Seconds to wait for the live game health check"),
    ] = 5.0,
    # fmt: on
) -> None:
    """Serve the gamestate visualizer (live proxy + graph-backed mock mode)."""
    upstream = game_url(game_host, game_port)
    if not mock:
        assert_game_reachable(upstream, timeout=health_timeout)
    server = UIServer(
        host=host,
        port=port,
        game_host=game_host,
        game_port=game_port,
        initial_mode="mock" if mock else "live",
        graph_path=graph,
        record_graph=not mock,
        verbose_graph=verbose,
    )
    typer.echo(f"Visualizer running at {server.url} (game: {server.game_url})")
    typer.echo(f"Mode: {'mock' if mock else 'live'}; graph: {graph}")
    typer.echo("Press Ctrl+C to stop.")
    if open_browser:
        webbrowser.open(server.url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        typer.echo("\nShutting down visualizer...")
        server.stop()
