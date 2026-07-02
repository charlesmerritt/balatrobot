"""UI command - Serve the gamestate visualizer web app."""

import webbrowser
from typing import Annotated

import typer

from balatrobot.ui.server import UIServer


def ui(
    # fmt: off
    host: Annotated[str, typer.Option(help="UI server hostname")] = "127.0.0.1",
    port: Annotated[int, typer.Option(help="UI server port")] = 12348,
    game_host: Annotated[str, typer.Option(help="Game server hostname")] = "127.0.0.1",
    game_port: Annotated[int, typer.Option(help="Game server port")] = 12346,
    open_browser: Annotated[
        bool, typer.Option("--open/--no-open", help="Open the UI in a browser")
    ] = False,
    # fmt: on
) -> None:
    """Serve the gamestate visualizer (live proxy to the game + mock mode)."""
    server = UIServer(host=host, port=port, game_host=game_host, game_port=game_port)
    typer.echo(f"Visualizer running at {server.url} (game: {server.game_url})")
    typer.echo("Press Ctrl+C to stop.")
    if open_browser:
        webbrowser.open(server.url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        typer.echo("\nShutting down visualizer...")
        server.stop()
