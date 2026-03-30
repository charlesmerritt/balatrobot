"""Linux platform launcher via Steam Proton."""

import glob
import logging
import os
import platform
import re
from pathlib import Path

logger = logging.getLogger(__name__)

from balatrobot.config import Config
from balatrobot.platforms.base import BaseLauncher

BALATRO_APP_ID = "2379780"

_STEAM_ROOT_CANDIDATES = [
    Path.home() / ".local/share/Steam",
    Path.home() / ".steam/steam",
    Path.home() / "snap/steam/common/.local/share/Steam",
    Path.home() / ".var/app/com.valvesoftware.Steam/.local/share/Steam",
]


def _detect_display() -> str | None:
    """Detect the X11 display from /tmp/.X11-unix sockets.

    When running from a non-graphical session (e.g. SSH into a Steam Deck),
    DISPLAY is typically unset even though an X server is running under
    gamescope. This checks for X11 sockets to find the right display.
    """
    try:
        sockets = sorted(Path("/tmp/.X11-unix").iterdir())
        if sockets:
            # Socket names are like X0, X1 — extract the display number
            name = sockets[0].name  # e.g. "X0"
            return f":{name[1:]}"
    except (FileNotFoundError, PermissionError):
        pass
    return None


def _detect_xauthority() -> str | None:
    """Detect the Xauthority file for the current user.

    On Steam Deck (and other systems using startx/gamescope), the Xauthority
    file is stored in XDG_RUNTIME_DIR with a random suffix rather than the
    traditional ~/.Xauthority location.
    """
    # Check XDG_RUNTIME_DIR first (Steam Deck puts it here)
    runtime_dir = os.environ.get("XDG_RUNTIME_DIR", f"/run/user/{os.getuid()}")
    matches = glob.glob(os.path.join(runtime_dir, "xauth_*"))
    if matches:
        return matches[0]

    # Fall back to ~/.Xauthority
    home_xauth = Path.home() / ".Xauthority"
    if home_xauth.is_file():
        return str(home_xauth)

    return None


def _parse_library_folders(vdf_path: Path) -> list[Path]:
    """Extract library folder paths from libraryfolders.vdf."""
    paths: list[Path] = []
    content = vdf_path.read_text()
    for match in re.finditer(r'"path"\s+"([^"]+)"', content):
        paths.append(Path(match.group(1)))
    return paths


def _detect_steam_root() -> Path | None:
    """Detect the primary Steam installation directory."""
    for candidate in _STEAM_ROOT_CANDIDATES:
        if candidate.is_dir() and (candidate / "steamapps").is_dir():
            return candidate.resolve()
    return None


def _detect_steam_libraries(steam_root: Path) -> list[Path]:
    """Return all Steam library steamapps directories.

    Parses libraryfolders.vdf to find additional library folders beyond
    the default. Always includes the primary steam_root.
    """
    seen: set[Path] = set()
    libraries: list[Path] = []

    def _add(steamapps: Path) -> None:
        resolved = steamapps.resolve()
        if resolved not in seen and resolved.is_dir():
            seen.add(resolved)
            libraries.append(resolved)

    _add(steam_root / "steamapps")

    vdf = steam_root / "steamapps" / "libraryfolders.vdf"
    if vdf.is_file():
        for folder in _parse_library_folders(vdf):
            _add(folder / "steamapps")

    return libraries


def _find_balatro(libraries: list[Path]) -> Path | None:
    """Find Balatro.exe in any Steam library."""
    for lib in libraries:
        exe = lib / "common" / "Balatro" / "Balatro.exe"
        if exe.is_file():
            return exe
    return None


def _parse_proton_version(name: str) -> tuple[int, ...] | None:
    """Extract version tuple from a Proton directory name.

    Returns (major, minor) for names like "Proton 10.0", None for
    non-versioned names like "Proton - Experimental".
    """
    m = re.match(r"Proton (\d+(?:\.\d+)*)$", name)
    if m:
        return tuple(int(x) for x in m.group(1).split("."))
    return None


def _find_proton(libraries: list[Path]) -> Path | None:
    """Find the best Proton installation across all libraries.

    Prefers Proton - Experimental (higher compatibility success rate),
    then falls back to the latest stable versioned Proton.
    """
    # Prefer Proton - Experimental
    for lib in libraries:
        experimental = lib / "common" / "Proton - Experimental"
        if experimental.is_dir() and (experimental / "proton").is_file():
            return experimental

    # Fall back to latest stable versioned Proton
    candidates: list[tuple[tuple[int, ...], Path]] = []

    for lib in libraries:
        common = lib / "common"
        if not common.is_dir():
            continue
        for entry in common.iterdir():
            if not entry.name.startswith("Proton") or not entry.is_dir():
                continue
            if not (entry / "proton").is_file():
                continue
            version = _parse_proton_version(entry.name)
            if version is not None:
                candidates.append((version, entry))

    if candidates:
        candidates.sort(key=lambda c: c[0], reverse=True)
        return candidates[0][1]

    return None


def _find_compat_data(libraries: list[Path]) -> Path | None:
    """Find the Balatro Wine prefix (compatdata) in any library."""
    for lib in libraries:
        compat = lib / "compatdata" / BALATRO_APP_ID
        if compat.is_dir():
            return compat
    return None


class LinuxLauncher(BaseLauncher):
    """Linux-specific Balatro launcher via Steam Proton.

    Runs Balatro.exe through Proton's Wine compatibility layer. Lovely
    injection works via version.dll, the same mechanism as on Windows.

    Auto-detects:
    - Steam root (native, Snap, and Flatpak installations)
    - Balatro.exe across all Steam library folders
    - Proton runtime (prefers Experimental, falls back to latest stable)
    - version.dll (lovely) in the Balatro directory
    - Wine prefix (compatdata) for Balatro
    """

    def __init__(self) -> None:
        self._steam_root: Path | None = None
        self._proton_dir: Path | None = None
        self._compat_data: Path | None = None

    def validate_paths(self, config: Config) -> None:
        """Validate and auto-detect paths for Linux Proton launcher."""
        if platform.system().lower() != "linux":
            raise RuntimeError("Linux launcher is only supported on Linux")

        errors: list[str] = []

        # Steam root
        self._steam_root = _detect_steam_root()
        if self._steam_root is None:
            errors.append(
                "Steam installation not found.\n"
                "  Expected: ~/.local/share/Steam or ~/.steam/steam"
            )
            raise RuntimeError("Path validation failed:\n\n" + "\n\n".join(errors))

        libraries = _detect_steam_libraries(self._steam_root)

        # love_path → Balatro.exe
        if config.love_path is None:
            exe = _find_balatro(libraries)
            if exe:
                config.love_path = str(exe)
            else:
                errors.append(
                    "Balatro not found in Steam library.\n"
                    "  Set via: --love-path or BALATROBOT_LOVE_PATH\n"
                    "  Install Balatro through Steam"
                )
        if config.love_path and not Path(config.love_path).is_file():
            errors.append(f"Balatro executable not found: {config.love_path}")

        # lovely_path → version.dll
        if config.lovely_path is None and config.love_path:
            dll = Path(config.love_path).parent / "version.dll"
            if dll.is_file():
                config.lovely_path = str(dll)
        if config.lovely_path is None:
            errors.append(
                "Lovely injector (version.dll) not found.\n"
                "  Set via: --lovely-path or BALATROBOT_LOVELY_PATH\n"
                "  Install lovely and place version.dll in the Balatro directory"
            )
        elif not Path(config.lovely_path).is_file():
            errors.append(f"Lovely injector not found: {config.lovely_path}")

        # Proton
        self._proton_dir = _find_proton(libraries)
        if self._proton_dir is None:
            errors.append(
                "No Proton installation found.\n"
                "  Install Proton via Steam (Settings > Compatibility)"
            )

        # Compat data (Wine prefix)
        self._compat_data = _find_compat_data(libraries)
        if self._compat_data is None:
            errors.append(
                "Balatro Wine prefix not found.\n"
                f"  Expected: steamapps/compatdata/{BALATRO_APP_ID}\n"
                "  Run Balatro once through Steam to create the prefix"
            )

        if errors:
            raise RuntimeError("Path validation failed:\n\n" + "\n\n".join(errors))

    def build_env(self, config: Config) -> dict[str, str]:
        """Build environment with Proton compatibility variables.

        Auto-detects DISPLAY and XAUTHORITY when not already set, which is
        common when running from SSH or a non-graphical session on Steam Deck.
        """
        assert self._steam_root is not None
        assert self._compat_data is not None

        env = os.environ.copy()

        # X11 display — required for the game window to render.
        # On Steam Deck via SSH, DISPLAY is unset even though gamescope
        # provides an X server.
        if "DISPLAY" not in env:
            display = _detect_display()
            if display:
                env["DISPLAY"] = display
            else:
                logger.warning(
                    "Could not auto-detect X11 display. "
                    "Set DISPLAY manually or ensure an X server is running."
                )

        # Xauthority — required to authenticate with the X server.
        # On Steam Deck the auth file lives in XDG_RUNTIME_DIR with a
        # random suffix (e.g. /run/user/1000/xauth_IiwJYr).
        if "XAUTHORITY" not in env:
            xauth = _detect_xauthority()
            if xauth:
                env["XAUTHORITY"] = xauth
            else:
                logger.warning(
                    "Could not auto-detect Xauthority file. "
                    "Set XAUTHORITY manually if X11 authentication fails."
                )

        env["STEAM_COMPAT_DATA_PATH"] = str(self._compat_data)
        env["STEAM_COMPAT_CLIENT_INSTALL_PATH"] = str(self._steam_root)
        env["SteamAppId"] = BALATRO_APP_ID
        env["SteamGameId"] = BALATRO_APP_ID
        # Force Wine to load the native version.dll (Lovely injector) from
        # the game directory instead of Wine's built-in implementation.
        # This is the equivalent of setting the Steam launch option:
        #   WINEDLLOVERRIDES="version=n,b" %command%
        env["WINEDLLOVERRIDES"] = "version=n,b"
        env.update(config.to_env())
        return env

    def build_cmd(self, config: Config) -> list[str]:
        """Build Proton launch command."""
        assert self._proton_dir is not None
        assert config.love_path is not None
        proton = str(self._proton_dir / "proton")
        return [proton, "run", config.love_path]
