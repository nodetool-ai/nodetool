import argparse
import json
import logging
import os
import shlex
import shutil
import subprocess
import sys
import threading
from pathlib import Path
from platform import machine, system
from typing import Iterable, Sequence

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).parent.resolve()
DEFAULT_PYTHON_VERSION = os.environ.get("PYTHON_VERSION", "3.11")
ENVIRONMENT_FILE = PROJECT_ROOT / "environment.yml"


def _format_command(command: Sequence[str]) -> str:
    """Return a human-friendly shell representation of *command*."""

    return shlex.join(map(str, command))


def unique_sequence(items: Iterable[str]) -> list[str]:
    """Return items with duplicates removed while preserving order."""

    seen: set[str] = set()
    unique: list[str] = []
    for item in items:
        if item not in seen:
            seen.add(item)
            unique.append(item)
    return unique


def detect_conda_executable(preferred: Iterable[str] | None = None) -> str:
    """Locate a usable conda executable.

    Checks the ``CONDA_EXE`` environment variable, followed by the provided
    *preferred* executables, and finally a small list of known conda-compatible
    commands (``conda``, ``mamba``, ``micromamba``).
    """

    candidates: list[str] = []
    env_executable = os.environ.get("CONDA_EXE")
    if env_executable:
        candidates.append(env_executable)
    if preferred:
        candidates.extend(filter(None, preferred))
    candidates.extend(["conda", "mamba", "micromamba"])

    for candidate in candidates:
        path = Path(candidate)
        if path.is_file():
            return str(path)
        resolved = shutil.which(candidate)
        if resolved:
            return resolved

    raise BuildError(
        "Unable to locate a conda executable. Set CONDA_EXE or ensure conda is on PATH."
    )


def run_command_capture(
    command: Sequence[str],
    *,
    cwd: str | Path | None = None,
    env: dict[str, str] | None = None,
) -> str:
    """Run *command* and capture stdout.

    Raises :class:`BuildError` on failure, logging stderr for convenience.
    """

    logger.info(_format_command(command))
    result = subprocess.run(
        list(map(str, command)),
        cwd=cwd,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )

    if result.returncode != 0:
        if result.stdout:
            logger.info(result.stdout.strip())
        if result.stderr:
            logger.error(result.stderr.strip())
        raise BuildError(
            f"Command failed with return code {result.returncode}: {_format_command(command)}"
        )

    return result.stdout


class BuildError(Exception):
    """Custom exception for build errors.

    Raised when a build step fails (e.g., a command returns a non-zero exit
    status) and the error is not marked as ignorable.
    """

    pass


class Build:
    """Manage building and packaging of the Nodetool application.

        This helper orchestrates creating a dedicated Conda environment from
        ``environment.yml`` and packaging it for distribution.

    Args:
        clean_build: If True, remove previous build artifacts and environment
            before starting.
        python_version: Python version to install into the Conda environment.

    Attributes:
        platform: Normalized platform name (e.g., ``"windows"``, ``"linux"``).
        arch: Normalized CPU architecture (e.g., ``"x64"``, ``"arm64"``).
        BUILD_DIR: Path to the build output directory.
        ENV_DIR: Path to the Conda environment directory.
    """

    def __init__(
        self,
        clean_build: bool = False,
        python_version: str = DEFAULT_PYTHON_VERSION,
    ):
        """Initialize the build configuration and computed paths.

        Args:
            clean_build: Remove any previous build outputs before proceeding.
            python_version: Python version string acceptable by Conda, such as
                ``"3.11"``.
        """
        platform = system().lower()
        arch = machine().lower()

        # Normalize architecture
        if arch == "amd64":
            arch = "x64"
        if arch == "x86_64":
            arch = "x64"
        if arch == "aarch64":
            arch = "arm64"

        self.clean_build = clean_build
        self.platform = platform
        self.arch = arch
        self.python_version = python_version
        self.conda_exe = detect_conda_executable()

        self.BUILD_DIR = PROJECT_ROOT / "build"
        self.ENV_DIR = self.BUILD_DIR / "env"

        if not self.BUILD_DIR.exists():
            self.create_directory(self.BUILD_DIR)

    @staticmethod
    def run_command(
        command: Sequence[str],
        cwd: str | Path | None = None,
        env: dict[str, str] | None = None,
        ignore_error: bool = False,
    ) -> int:
        """Execute a shell command and stream output to the logger.

        Args:
            command: Full command and arguments to execute.
            cwd: Optional working directory for the process.
            env: Optional environment to pass to the process.
            ignore_error: If True, do not raise on non-zero exit status.

        Returns:
            The process return code.

        Raises:
            BuildError: If the command exits non-zero and ``ignore_error`` is False.
        """
        command_list = list(map(str, command))
        logger.info(_format_command(command_list))

        process = subprocess.Popen(
            command_list,
            cwd=str(cwd) if cwd else None,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            text=True,
            bufsize=256,
        )

        def stream_output(pipe, log_func):
            """Forward each line from *pipe* to *log_func*."""
            for line in iter(pipe.readline, ""):
                log_func(line.strip())

        stdout_thread = threading.Thread(
            target=stream_output, args=(process.stdout, logger.info)
        )
        stderr_thread = threading.Thread(
            target=stream_output, args=(process.stderr, logger.info)
        )

        stdout_thread.start()
        stderr_thread.start()

        return_code = process.wait()

        stdout_thread.join()
        stderr_thread.join()

        if return_code != 0 and not ignore_error:
            raise BuildError(
                f"Command failed with return code {return_code}: {_format_command(command_list)}"
            )

        return return_code

    def conda_cmd(self, *args: str) -> list[str]:
        """Return a command list prefixed with the detected conda executable."""

        return [self.conda_exe, *map(str, args)]

    def create_directory(self, path: Path, parents: bool = True) -> None:
        """Create a directory if it does not already exist.

        Args:
            path: Directory path to create.
            parents: When True, create parent directories as needed.
        """
        logger.info(f"Creating directory: {path}")
        path.mkdir(parents=parents, exist_ok=True)

    def copy_file(self, src: Path, dst: Path) -> None:
        """Copy a single file preserving metadata.

        Args:
            src: Source file path.
            dst: Destination file path.
        """
        logger.info(f"Copying file: {src} to {dst}")
        shutil.copy2(src, dst)

    def copy_tree(self, src: Path, dst: Path) -> None:
        """Copy a directory tree into a destination directory.

        Args:
            src: Source directory path.
            dst: Destination directory path.
        """
        logger.info(f"Copying tree: {src} to {dst}")
        shutil.copytree(src, dst, dirs_exist_ok=True)

    def remove_directory(self, path: Path) -> None:
        """Remove a directory and all of its contents.

        Args:
            path: Directory to remove.
        """
        logger.info(f"Removing directory: {path}")
        shutil.rmtree(path, ignore_errors=True)

    def remove_file(self, path: Path) -> None:
        """Remove a file if it exists.

        Args:
            path: File path to remove.
        """
        logger.info(f"Removing file: {path}")
        try:
            path.unlink()
        except FileNotFoundError:
            pass

    def move_file(self, src: Path, dst: Path) -> None:
        """Move or rename a file.

        Args:
            src: Source file path.
            dst: Destination file path.
        """
        logger.info(f"Moving file: {src} to {dst}")
        shutil.move(src, dst)

    def setup(self) -> None:
        """Set up directories for the build process.

        Creates or cleans the build directory based on the configuration.
        """

        if self.clean_build:
            try:
                self.remove_directory(self.BUILD_DIR)
            except BuildError:
                pass

        try:
            self.create_directory(self.BUILD_DIR)
        except BuildError as e:
            logger.error(f"Failed to create build directory: {e}")
            sys.exit(1)

    def pack(self) -> None:
        """Create and pack a Conda environment for distribution.

        On Windows, installs a CUDA 12.6 variant of the llama.cpp package
        (``llama.cpp=*=cuda126*``). On other platforms, installs the default
        ``llama.cpp`` package.
        """
        logger.info("Packing conda environment")

        if not ENVIRONMENT_FILE.exists():
            raise BuildError("environment.yml not found. Cannot pack environment.")

        # Ensure conda-pack is available
        self.run_command(self.conda_cmd("install", "conda-pack", "-y"))

        if self.clean_build:
            self.remove_directory(self.ENV_DIR)

        # Create or update the conda environment using environment.yml
        self.run_command(
            self.conda_cmd(
                "env",
                "update",
                "--prefix",
                str(self.ENV_DIR),
                "--file",
                str(ENVIRONMENT_FILE),
                "--prune",
            )
        )

        # Pack the environment
        ext = "zip" if self.platform == "windows" else "tar.gz"
        output_name = f"conda-env-{self.platform}-{self.arch}.{ext}"
        output_path = self.BUILD_DIR / output_name

        self.remove_file(output_path)

        # This is needed to avoid the clobbering of base packages error
        self.run_command(self.conda_cmd("list", "-p", str(self.ENV_DIR)))

        self.run_command(
            ["conda-pack", "-p", str(self.ENV_DIR), "-o", str(output_path)]
        )

        logger.info(f"Environment packed successfully to {output_name}")


class CondaEnvironmentManager:
    """High-level helpers for creating and managing the Nodetool conda env."""

    DEFAULT_ENV_NAME = "nodetool"
    DEFAULT_CHANNELS = ["conda-forge"]

    def __init__(
        self,
        *,
        env_name: str | None = None,
        env_prefix: str | Path | None = None,
        python_version: str = DEFAULT_PYTHON_VERSION,
        channels: Iterable[str] | None = None,
    ) -> None:
        self.platform = system().lower()
        arch = machine().lower()
        if arch == "amd64":
            arch = "x64"
        if arch == "x86_64":
            arch = "x64"
        if arch == "aarch64":
            arch = "arm64"

        self.arch = arch
        self.python_version = python_version
        self.env_name = env_name or self.DEFAULT_ENV_NAME
        self.env_prefix = (
            Path(env_prefix).expanduser().resolve() if env_prefix is not None else None
        )
        combined_channels = list(self.DEFAULT_CHANNELS)
        if channels:
            combined_channels.extend(channels)
        self.channels = unique_sequence(combined_channels)
        self.conda_exe = detect_conda_executable()

        self.base_packages = [
            f"python={self.python_version}",
            "pip",
            "git",
            "nodejs",
            "uv",
            "ffmpeg",
        ]

        llama_pkg = "llama.cpp" if self.platform == "darwin" else "llama.cpp=*=cuda126*"
        self.build_packages = [
            "cairo",
            "x264",
            "x265",
            "aom",
            "libopus",
            "libvorbis",
            "libpng",
            "libjpeg-turbo",
            "libtiff",
            "openjpeg",
            "libwebp",
            "giflib",
            "lame",
            "pandoc",
            "lua",
            llama_pkg,
        ]

    def conda_cmd(self, *args: str) -> list[str]:
        return [self.conda_exe, *map(str, args)]

    def _channel_args(self) -> list[str]:
        args: list[str] = []
        for channel in self.channels:
            args.extend(["-c", channel])
        return args

    def _target_args(self) -> list[str]:
        if self.env_prefix is not None:
            return ["-p", str(self.env_prefix)]
        return ["-n", self.env_name]

    def _load_envs(self) -> dict:
        output = run_command_capture(self.conda_cmd("env", "list", "--json"))
        try:
            return json.loads(output)
        except json.JSONDecodeError as exc:
            raise BuildError("Failed to parse conda env list output") from exc

    def _resolve_existing_prefix(self) -> Path | None:
        data = self._load_envs()
        target_prefix = self.env_prefix
        matches: list[Path] = []
        for entry in data.get("envs", []):
            path = Path(entry)
            if target_prefix is not None and path == target_prefix:
                return path
            if target_prefix is None and path.name == self.env_name:
                matches.append(path)
        if matches:
            return matches[0]
        return None

    def env_exists(self) -> bool:
        return self._resolve_existing_prefix() is not None

    def default_packages(self, include_build_deps: bool = False) -> list[str]:
        packages = list(self.base_packages)
        if include_build_deps:
            packages.extend(self.build_packages)
        return unique_sequence(packages)

    def create(
        self,
        *,
        force: bool = False,
        include_build_deps: bool = False,
        extra_packages: Iterable[str] | None = None,
    ) -> None:
        if self.env_exists():
            if not force:
                logger.info(
                    "Conda environment already exists; use --force to recreate it."
                )
                return
            logger.info("Removing existing conda environment before recreation.")
            self.remove(skip_confirmation=True)

        if not ENVIRONMENT_FILE.exists():
            raise BuildError("environment.yml not found. Cannot create environment.")

        base_command: list[str] = self.conda_cmd(
            "env",
            "create",
            "--file",
            str(ENVIRONMENT_FILE),
        )

        if self.env_prefix is not None:
            base_command.extend(["--prefix", str(self.env_prefix)])
        else:
            base_command.extend(["--name", self.env_name])

        Build.run_command(base_command)

        if include_build_deps or extra_packages:
            additional_packages = []
            if include_build_deps:
                additional_packages.extend(self.build_packages)
            if extra_packages:
                additional_packages.extend(extra_packages)
            packages = unique_sequence(additional_packages)
            if packages:
                update_command = self.conda_cmd(
                    "install",
                    "--yes",
                    *self._channel_args(),
                    *self._target_args(),
                    *packages,
                )
                Build.run_command(update_command)

    def remove(self, *, skip_confirmation: bool = False) -> None:
        if not self.env_exists():
            logger.info("Conda environment not found; nothing to remove.")
            return

        command = self.conda_cmd("env", "remove", *self._target_args())
        if skip_confirmation:
            command.append("--yes")
        Build.run_command(command)

    def list(self) -> None:
        Build.run_command(self.conda_cmd("env", "list"))

    def info(self) -> None:
        prefix = self._resolve_existing_prefix()
        if prefix is None:
            raise BuildError("Conda environment not found; create it first.")

        activation_hint = (
            f"conda activate {self.env_name}"
            if self.env_prefix is None
            else f"conda activate {prefix}"
        )

        logger.info(f"Environment name: {self.env_name}")
        logger.info(f"Environment prefix: {prefix}")
        logger.info(f"Activation command: {activation_hint}")

    def run(self, command: Sequence[str]) -> None:
        if not command:
            raise BuildError("No command provided to run inside the environment.")
        if not self.env_exists():
            raise BuildError("Conda environment not found; create it first.")

        composed = self.conda_cmd(
            "run",
            "--no-capture-output",
            *self._target_args(),
            *command,
        )
        Build.run_command(composed)

    def shell(self, shell_command: str | None = None) -> None:
        if shell_command:
            chosen_shell = shell_command
        elif self.platform == "windows":
            chosen_shell = os.environ.get("COMSPEC", "cmd.exe")
        else:
            chosen_shell = os.environ.get("SHELL", "/bin/bash")

        shell_args: list[str]
        if self.platform != "windows" and chosen_shell in {"/bin/bash", "bash"}:
            shell_args = [chosen_shell, "-l"]
        else:
            shell_args = [chosen_shell]

        self.run(shell_args)


def configure_logging(level: str | int | None) -> int:
    """Configure root logging and return the numeric level used."""

    if isinstance(level, int):
        numeric = level
    else:
        level_name = (level or os.environ.get("BUILD_LOG_LEVEL", "INFO")).upper()
        numeric = logging.getLevelNamesMapping().get(level_name, logging.INFO)

    logging.basicConfig(level=numeric, format="%(message)s")
    logging.getLogger().setLevel(numeric)
    return numeric


def _build_manager_from_args(args: argparse.Namespace) -> CondaEnvironmentManager:
    return CondaEnvironmentManager(
        env_name=args.name if args.prefix is None else None,
        env_prefix=args.prefix,
        python_version=args.python_version,
        channels=args.channels,
    )


def handle_build_command(args: argparse.Namespace) -> None:
    build = Build(
        clean_build=args.clean,
        python_version=args.python_version,
    )
    steps = {"setup": build.setup, "pack": build.pack}
    step_method = steps.get(args.step)
    if step_method is None:
        raise BuildError(f"Invalid build step: {args.step}")
    step_method()


def handle_env_create(args: argparse.Namespace) -> None:
    manager = _build_manager_from_args(args)
    manager.create(
        force=args.force,
        include_build_deps=args.full,
        extra_packages=args.packages,
    )


def handle_env_remove(args: argparse.Namespace) -> None:
    manager = _build_manager_from_args(args)
    manager.remove(skip_confirmation=args.yes)


def handle_env_info(args: argparse.Namespace) -> None:
    manager = _build_manager_from_args(args)
    manager.info()


def handle_env_list(
    args: argparse.Namespace,
) -> None:  # noqa: ARG001 - matches signature
    manager = CondaEnvironmentManager()
    manager.list()


def handle_env_run(args: argparse.Namespace) -> None:
    manager = _build_manager_from_args(args)
    command = list(args.command)
    if command and command[0] == "--":
        command = command[1:]
    if not command:
        raise BuildError("Provide a command after -- to run inside the environment.")
    manager.run(command)


def handle_env_shell(args: argparse.Namespace) -> None:
    manager = _build_manager_from_args(args)
    manager.shell(args.shell)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Build and environment management for Nodetool",
    )
    parser.add_argument(
        "--log-level",
        default=None,
        help="Logging level (DEBUG, INFO, WARNING, ERROR). Defaults to BUILD_LOG_LEVEL env.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    build_parser = subparsers.add_parser("build", help="Run build-related steps")
    build_parser.add_argument(
        "step",
        choices=["setup", "pack"],
        help="Build step to run",
    )
    build_parser.add_argument(
        "--clean",
        action="store_true",
        help="Clean the build directory before running",
    )
    build_parser.add_argument(
        "--python-version",
        default=DEFAULT_PYTHON_VERSION,
        help="Python version to use for packaging (e.g., 3.11)",
    )
    build_parser.set_defaults(func=handle_build_command)

    env_parser = subparsers.add_parser(
        "env", help="Manage the Nodetool conda environment"
    )
    env_subparsers = env_parser.add_subparsers(dest="env_command", required=True)

    target_parent = argparse.ArgumentParser(add_help=False)
    target_parent.add_argument(
        "--name",
        default=CondaEnvironmentManager.DEFAULT_ENV_NAME,
        help=f"Conda environment name (default: {CondaEnvironmentManager.DEFAULT_ENV_NAME})",
    )
    target_parent.add_argument(
        "--prefix",
        help="Full path to the environment prefix. Overrides --name when provided.",
    )

    create_parent = argparse.ArgumentParser(add_help=False)
    create_parent.add_argument(
        "--python-version",
        default=DEFAULT_PYTHON_VERSION,
        help="Python version to install when creating the environment",
    )
    create_parent.add_argument(
        "--channel",
        dest="channels",
        action="append",
        help="Additional conda channels to include (conda-forge is always added)",
    )
    create_parent.add_argument(
        "-p",
        "--package",
        dest="packages",
        action="append",
        help="Extra packages to install (can be supplied multiple times)",
    )
    create_parent.add_argument(
        "--full",
        action="store_true",
        help="Include the full set of build dependencies used for packaging",
    )
    create_parent.add_argument(
        "--force",
        action="store_true",
        help="Recreate the environment if it already exists",
    )

    create_parser = env_subparsers.add_parser(
        "create",
        help="Create the conda environment",
        parents=[target_parent, create_parent],
    )
    create_parser.set_defaults(func=handle_env_create)

    remove_parser = env_subparsers.add_parser(
        "remove",
        help="Delete the conda environment",
        parents=[target_parent],
    )
    remove_parser.add_argument(
        "--yes",
        action="store_true",
        help="Do not prompt before removing the environment",
    )
    remove_parser.set_defaults(func=handle_env_remove, python_version=DEFAULT_PYTHON_VERSION, channels=None)

    info_parser = env_subparsers.add_parser(
        "info",
        help="Show environment activation details",
        parents=[target_parent],
    )
    info_parser.set_defaults(func=handle_env_info, python_version=DEFAULT_PYTHON_VERSION, channels=None)

    run_parser = env_subparsers.add_parser(
        "run",
        help="Execute a command inside the environment",
        parents=[target_parent],
    )
    run_parser.add_argument(
        "command",
        nargs=argparse.REMAINDER,
        help="Command to execute (prefix with -- to avoid parsing issues)",
    )
    run_parser.set_defaults(func=handle_env_run, python_version=DEFAULT_PYTHON_VERSION, channels=None)

    shell_parser = env_subparsers.add_parser(
        "shell",
        help="Open an interactive shell inside the environment",
        parents=[target_parent],
    )
    shell_parser.add_argument(
        "--shell",
        help="Shell executable to launch (default depends on the platform)",
    )
    shell_parser.set_defaults(func=handle_env_shell, python_version=DEFAULT_PYTHON_VERSION, channels=None)

    env_list_parser = env_subparsers.add_parser("list", help="List conda environments")
    env_list_parser.set_defaults(func=handle_env_list)

    return parser


def main() -> None:
    argv = sys.argv[1:]
    legacy_commands = {"setup", "pack"}

    if argv and argv[0] in legacy_commands:
        configure_logging(None)
        legacy_parser = argparse.ArgumentParser(
            description="Legacy interface for build steps",
        )
        legacy_parser.add_argument(
            "step",
            choices=sorted(legacy_commands),
            help="Build step to run",
        )
        legacy_parser.add_argument(
            "--clean",
            action="store_true",
            help="Clean the build directory before running",
        )
        legacy_parser.add_argument(
            "--python-version",
            default=DEFAULT_PYTHON_VERSION,
            help="Python version to use for the conda environment (e.g., 3.11)",
        )
        args = legacy_parser.parse_args(argv)
        handle_build_command(args)
        return

    parser = build_parser()
    args = parser.parse_args(argv)
    configure_logging(args.log_level)

    try:
        args.func(args)
    except BuildError as exc:
        logger.error(str(exc))
        sys.exit(1)


if __name__ == "__main__":
    main()
