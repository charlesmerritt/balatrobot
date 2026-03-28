"""Tests for balatrobot.platforms module."""

import platform as platform_module
from pathlib import Path

import pytest

from balatrobot.config import Config
from balatrobot.platforms import VALID_PLATFORMS, get_launcher
from balatrobot.platforms.linux import (
    LinuxLauncher,
    _parse_library_folders,
    _parse_proton_version,
)
from balatrobot.platforms.macos import MacOSLauncher
from balatrobot.platforms.native import NativeLauncher
from balatrobot.platforms.windows import WindowsLauncher

IS_MACOS = platform_module.system() == "Darwin"
IS_LINUX = platform_module.system() == "Linux"
IS_WINDOWS = platform_module.system() == "Windows"


class TestGetLauncher:
    """Tests for get_launcher() factory function."""

    def test_invalid_platform_raises(self):
        """Invalid platform string raises ValueError."""
        with pytest.raises(ValueError, match="Invalid platform"):
            get_launcher("invalid")

    def test_darwin_returns_macos_launcher(self):
        """'darwin' returns MacOSLauncher."""
        launcher = get_launcher("darwin")
        assert isinstance(launcher, MacOSLauncher)

    def test_native_returns_native_launcher(self):
        """'native' returns NativeLauncher."""
        launcher = get_launcher("native")
        assert isinstance(launcher, NativeLauncher)

    def test_windows_returns_windows_launcher(self):
        """'windows' returns WindowsLauncher."""
        launcher = get_launcher("windows")
        assert isinstance(launcher, WindowsLauncher)

    def test_linux_returns_linux_launcher(self):
        """'linux' returns LinuxLauncher."""
        launcher = get_launcher("linux")
        assert isinstance(launcher, LinuxLauncher)

    def test_valid_platforms_constant(self):
        """VALID_PLATFORMS contains expected values."""
        assert "darwin" in VALID_PLATFORMS
        assert "linux" in VALID_PLATFORMS
        assert "windows" in VALID_PLATFORMS
        assert "native" in VALID_PLATFORMS


@pytest.mark.skipif(not IS_MACOS, reason="macOS only")
class TestMacOSLauncher:
    """Tests for MacOSLauncher (macOS only)."""

    def test_validate_paths_missing_love(self, tmp_path):
        """Raises RuntimeError when love executable missing."""
        launcher = MacOSLauncher()
        config = Config(love_path=str(tmp_path / "nonexistent"))

        with pytest.raises(RuntimeError, match="LOVE executable not found"):
            launcher.validate_paths(config)

    def test_validate_paths_missing_lovely(self, tmp_path):
        """Raises RuntimeError when liblovely.dylib missing."""
        # Create a fake love executable
        love_path = tmp_path / "love"
        love_path.touch()

        launcher = MacOSLauncher()
        config = Config(
            love_path=str(love_path),
            lovely_path=str(tmp_path / "nonexistent.dylib"),
        )

        with pytest.raises(RuntimeError, match="liblovely.dylib not found"):
            launcher.validate_paths(config)

    def test_build_env_includes_dyld(self, tmp_path):
        """build_env includes DYLD_INSERT_LIBRARIES."""
        launcher = MacOSLauncher()
        config = Config(lovely_path="/path/to/liblovely.dylib")

        env = launcher.build_env(config)

        assert env["DYLD_INSERT_LIBRARIES"] == "/path/to/liblovely.dylib"

    def test_build_cmd(self, tmp_path):
        """build_cmd returns love executable path."""
        launcher = MacOSLauncher()
        config = Config(love_path="/path/to/love")

        cmd = launcher.build_cmd(config)

        assert cmd == ["/path/to/love"]


@pytest.mark.skipif(not IS_LINUX, reason="Linux only")
class TestNativeLauncher:
    """Tests for NativeLauncher (Linux only)."""

    def test_validate_paths_missing_love(self, tmp_path):
        """Raises RuntimeError when love executable missing."""
        launcher = NativeLauncher()
        config = Config(
            love_path=str(tmp_path / "nonexistent"),
            balatro_path=str(tmp_path),
        )

        with pytest.raises(RuntimeError, match="LOVE executable not found"):
            launcher.validate_paths(config)

    def test_build_env_includes_ld_preload(self, tmp_path):
        """build_env includes LD_PRELOAD."""
        launcher = NativeLauncher()
        config = Config(lovely_path="/path/to/liblovely.so")

        env = launcher.build_env(config)

        assert env["LD_PRELOAD"] == "/path/to/liblovely.so"

    def test_build_cmd(self, tmp_path):
        """build_cmd returns love and balatro path."""
        launcher = NativeLauncher()
        config = Config(love_path="/usr/bin/love", balatro_path="/path/to/balatro")

        cmd = launcher.build_cmd(config)

        assert cmd == ["/usr/bin/love", "/path/to/balatro"]


@pytest.mark.skipif(not IS_WINDOWS, reason="Windows only")
class TestWindowsLauncher:
    """Tests for WindowsLauncher (Windows only)."""

    def test_validate_paths_missing_balatro_exe(self, tmp_path):
        """Raises RuntimeError when Balatro.exe missing."""
        launcher = WindowsLauncher()
        config = Config(love_path=str(tmp_path / "nonexistent.exe"))

        with pytest.raises(RuntimeError, match="Balatro executable not found"):
            launcher.validate_paths(config)

    def test_validate_paths_missing_version_dll(self, tmp_path):
        """Raises RuntimeError when version.dll missing."""
        # Create a fake Balatro.exe
        exe_path = tmp_path / "Balatro.exe"
        exe_path.touch()

        launcher = WindowsLauncher()
        config = Config(
            love_path=str(exe_path),
            lovely_path=str(tmp_path / "nonexistent.dll"),
        )

        with pytest.raises(RuntimeError, match="version.dll not found"):
            launcher.validate_paths(config)

    def test_build_env_no_dll_injection_var(self, tmp_path):
        """build_env does not include DLL injection environment variable."""
        launcher = WindowsLauncher()
        config = Config(lovely_path=r"C:\path\to\version.dll")

        env = launcher.build_env(config)

        assert "DYLD_INSERT_LIBRARIES" not in env
        assert "LD_PRELOAD" not in env

    def test_build_cmd(self, tmp_path):
        """build_cmd returns Balatro.exe path."""
        launcher = WindowsLauncher()
        config = Config(love_path=r"C:\path\to\Balatro.exe")

        cmd = launcher.build_cmd(config)

        assert cmd == [r"C:\path\to\Balatro.exe"]


class TestParseProtonVersion:
    """Tests for _parse_proton_version."""

    def test_stable_version(self):
        assert _parse_proton_version("Proton 10.0") == (10, 0)

    def test_older_version(self):
        assert _parse_proton_version("Proton 8.0") == (8, 0)

    def test_beta_excluded(self):
        assert _parse_proton_version("Proton 9.0 (Beta)") is None

    def test_experimental_excluded(self):
        assert _parse_proton_version("Proton - Experimental") is None

    def test_hotfix_excluded(self):
        assert _parse_proton_version("Proton Hotfix") is None

    def test_not_proton(self):
        assert _parse_proton_version("Something Else") is None


class TestParseLibraryFolders:
    """Tests for _parse_library_folders."""

    def test_single_library(self, tmp_path):
        vdf = tmp_path / "libraryfolders.vdf"
        vdf.write_text(
            '"libraryfolders"\n{\n\t"0"\n\t{\n'
            '\t\t"path"\t\t"/home/user/.local/share/Steam"\n'
            "\t}\n}\n"
        )
        paths = _parse_library_folders(vdf)
        assert len(paths) == 1
        assert paths[0] == Path("/home/user/.local/share/Steam")

    def test_multiple_libraries(self, tmp_path):
        vdf = tmp_path / "libraryfolders.vdf"
        vdf.write_text(
            '"libraryfolders"\n{\n\t"0"\n\t{\n'
            '\t\t"path"\t\t"/home/user/.local/share/Steam"\n'
            '\t}\n\t"1"\n\t{\n'
            '\t\t"path"\t\t"/run/media/sdcard/SteamLibrary"\n'
            "\t}\n}\n"
        )
        paths = _parse_library_folders(vdf)
        assert len(paths) == 2
        assert paths[1] == Path("/run/media/sdcard/SteamLibrary")


@pytest.mark.skipif(not IS_LINUX, reason="Linux only")
class TestLinuxLauncher:
    """Tests for LinuxLauncher (Linux only)."""

    def _make_steam_tree(self, tmp_path):
        """Create a minimal fake Steam directory tree."""
        steam = tmp_path / "Steam"
        steamapps = steam / "steamapps"
        balatro_dir = steamapps / "common" / "Balatro"
        balatro_dir.mkdir(parents=True)

        # Balatro.exe
        exe = balatro_dir / "Balatro.exe"
        exe.touch()

        # version.dll (lovely)
        dll = balatro_dir / "version.dll"
        dll.touch()

        # Proton
        proton_dir = steamapps / "common" / "Proton 10.0"
        proton_dir.mkdir(parents=True)
        proton_script = proton_dir / "proton"
        proton_script.touch()

        # Compat data (Wine prefix)
        compat = steamapps / "compatdata" / "2379780"
        compat.mkdir(parents=True)

        # libraryfolders.vdf
        vdf = steamapps / "libraryfolders.vdf"
        vdf.write_text(
            f'"libraryfolders"\n{{\n\t"0"\n\t{{\n\t\t"path"\t\t"{steam}"\n\t}}\n}}\n'
        )

        return steam

    def test_validate_paths_auto_detects(self, tmp_path, monkeypatch):
        """Auto-detects Balatro, Proton, and compat data from Steam tree."""
        steam = self._make_steam_tree(tmp_path)
        monkeypatch.setattr(
            "balatrobot.platforms.linux._STEAM_ROOT_CANDIDATES", [steam]
        )

        launcher = LinuxLauncher()
        config = Config()
        launcher.validate_paths(config)

        assert config.love_path == str(steam / "steamapps/common/Balatro/Balatro.exe")
        assert config.lovely_path == str(steam / "steamapps/common/Balatro/version.dll")

    def test_validate_paths_no_steam(self, tmp_path, monkeypatch):
        """Raises RuntimeError when Steam is not found."""
        monkeypatch.setattr(
            "balatrobot.platforms.linux._STEAM_ROOT_CANDIDATES",
            [tmp_path / "nonexistent"],
        )

        launcher = LinuxLauncher()
        config = Config()
        with pytest.raises(RuntimeError, match="Steam installation not found"):
            launcher.validate_paths(config)

    def test_validate_paths_no_balatro(self, tmp_path, monkeypatch):
        """Raises RuntimeError when Balatro is not installed."""
        steam = tmp_path / "Steam"
        steamapps = steam / "steamapps"
        steamapps.mkdir(parents=True)
        # Proton exists but no Balatro
        proton_dir = steamapps / "common" / "Proton 10.0"
        proton_dir.mkdir(parents=True)
        (proton_dir / "proton").touch()
        (steamapps / "compatdata" / "2379780").mkdir(parents=True)
        (steamapps / "libraryfolders.vdf").write_text(
            f'"libraryfolders"\n{{\n\t"0"\n\t{{\n\t\t"path"\t\t"{steam}"\n\t}}\n}}\n'
        )
        monkeypatch.setattr(
            "balatrobot.platforms.linux._STEAM_ROOT_CANDIDATES", [steam]
        )

        launcher = LinuxLauncher()
        config = Config()
        with pytest.raises(RuntimeError, match="Balatro not found"):
            launcher.validate_paths(config)

    def test_validate_paths_no_proton(self, tmp_path, monkeypatch):
        """Raises RuntimeError when no Proton is installed."""
        steam = tmp_path / "Steam"
        steamapps = steam / "steamapps"
        balatro_dir = steamapps / "common" / "Balatro"
        balatro_dir.mkdir(parents=True)
        (balatro_dir / "Balatro.exe").touch()
        (balatro_dir / "version.dll").touch()
        (steamapps / "compatdata" / "2379780").mkdir(parents=True)
        (steamapps / "libraryfolders.vdf").write_text(
            f'"libraryfolders"\n{{\n\t"0"\n\t{{\n\t\t"path"\t\t"{steam}"\n\t}}\n}}\n'
        )
        monkeypatch.setattr(
            "balatrobot.platforms.linux._STEAM_ROOT_CANDIDATES", [steam]
        )

        launcher = LinuxLauncher()
        config = Config()
        with pytest.raises(RuntimeError, match="No Proton installation found"):
            launcher.validate_paths(config)

    def test_validate_paths_no_compat_data(self, tmp_path, monkeypatch):
        """Raises RuntimeError when Wine prefix is missing."""
        steam = self._make_steam_tree(tmp_path)
        # Remove compat data
        import shutil

        shutil.rmtree(steam / "steamapps" / "compatdata" / "2379780")
        monkeypatch.setattr(
            "balatrobot.platforms.linux._STEAM_ROOT_CANDIDATES", [steam]
        )

        launcher = LinuxLauncher()
        config = Config()
        with pytest.raises(RuntimeError, match="Wine prefix not found"):
            launcher.validate_paths(config)

    def test_validate_paths_explicit_overrides(self, tmp_path, monkeypatch):
        """Explicit love_path and lovely_path override auto-detection."""
        steam = self._make_steam_tree(tmp_path)
        monkeypatch.setattr(
            "balatrobot.platforms.linux._STEAM_ROOT_CANDIDATES", [steam]
        )

        custom_exe = tmp_path / "custom" / "Balatro.exe"
        custom_dll = tmp_path / "custom" / "version.dll"
        custom_exe.parent.mkdir()
        custom_exe.touch()
        custom_dll.touch()

        launcher = LinuxLauncher()
        config = Config(love_path=str(custom_exe), lovely_path=str(custom_dll))
        launcher.validate_paths(config)

        assert config.love_path == str(custom_exe)
        assert config.lovely_path == str(custom_dll)

    def test_build_env_includes_proton_vars(self, tmp_path, monkeypatch):
        """build_env sets STEAM_COMPAT_DATA_PATH and related vars."""
        steam = self._make_steam_tree(tmp_path)
        monkeypatch.setattr(
            "balatrobot.platforms.linux._STEAM_ROOT_CANDIDATES", [steam]
        )

        launcher = LinuxLauncher()
        config = Config()
        launcher.validate_paths(config)
        env = launcher.build_env(config)

        assert env["STEAM_COMPAT_DATA_PATH"] == str(
            steam / "steamapps/compatdata/2379780"
        )
        assert env["STEAM_COMPAT_CLIENT_INSTALL_PATH"] == str(steam)
        assert env["SteamAppId"] == "2379780"
        assert env["SteamGameId"] == "2379780"
        assert env["WINEDLLOVERRIDES"] == "version=n,b"

    def test_build_cmd(self, tmp_path, monkeypatch):
        """build_cmd returns proton run command."""
        steam = self._make_steam_tree(tmp_path)
        monkeypatch.setattr(
            "balatrobot.platforms.linux._STEAM_ROOT_CANDIDATES", [steam]
        )

        launcher = LinuxLauncher()
        config = Config()
        launcher.validate_paths(config)
        cmd = launcher.build_cmd(config)

        proton = str(steam / "steamapps/common/Proton 10.0/proton")
        exe = str(steam / "steamapps/common/Balatro/Balatro.exe")
        assert cmd == [proton, "run", exe]

    def test_picks_latest_proton_version(self, tmp_path, monkeypatch):
        """Picks the highest stable Proton version when multiple exist."""
        steam = self._make_steam_tree(tmp_path)
        common = steam / "steamapps" / "common"
        # Add an older Proton
        older = common / "Proton 8.0"
        older.mkdir()
        (older / "proton").touch()
        monkeypatch.setattr(
            "balatrobot.platforms.linux._STEAM_ROOT_CANDIDATES", [steam]
        )

        launcher = LinuxLauncher()
        config = Config()
        launcher.validate_paths(config)
        cmd = launcher.build_cmd(config)

        assert "Proton 10.0" in cmd[0]

    def test_falls_back_to_experimental(self, tmp_path, monkeypatch):
        """Falls back to Proton Experimental when no stable version exists."""
        steam = self._make_steam_tree(tmp_path)
        common = steam / "steamapps" / "common"
        # Remove versioned Proton, add Experimental
        import shutil

        shutil.rmtree(common / "Proton 10.0")
        exp = common / "Proton - Experimental"
        exp.mkdir()
        (exp / "proton").touch()
        monkeypatch.setattr(
            "balatrobot.platforms.linux._STEAM_ROOT_CANDIDATES", [steam]
        )

        launcher = LinuxLauncher()
        config = Config()
        launcher.validate_paths(config)
        cmd = launcher.build_cmd(config)

        assert "Proton - Experimental" in cmd[0]
