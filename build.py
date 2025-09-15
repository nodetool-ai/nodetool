import argparse
import shutil
import subprocess
import sys
from pathlib import Path
from platform import system, machine
import threading
import subprocess
import threading
from textwrap import dedent
import os
import logging

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).parent.resolve()


class BuildError(Exception):
    """Custom exception for build errors.

    Raised when a build step fails (e.g., a command returns a non-zero exit
    status) and the error is not marked as ignorable.
    """

    pass


class Build:
    """Manage building and packaging of the Nodetool application.

    This helper orchestrates creating a dedicated Conda environment and
    packaging it for distribution.

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
        python_version: str = "3.11",
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

        self.BUILD_DIR = PROJECT_ROOT / "build"
        self.ENV_DIR = self.BUILD_DIR / "env"

        if not self.BUILD_DIR.exists():
            self.create_directory(self.BUILD_DIR)

    def run_command(
        self,
        command: list[str],
        cwd: str | Path | None = None,
        env: dict | None = None,
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
        # Remove the conda run wrapper since we're using base environment
        logger.info(" ".join(command))

        process = subprocess.Popen(
            " ".join(command),
            shell=True,
            cwd=cwd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            universal_newlines=True,
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
                f"Command failed with return code {return_code}: {' '.join(command)}"
            )

        return return_code

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

        # Install conda-pack
        self.run_command(["conda", "install", "conda-pack", "-y"])

        if self.clean_build:
            self.remove_directory(self.ENV_DIR)

        # Create new conda environment
        self.run_command(
            [
                "conda",
                "create",
                "--yes",
                "--verbose",
                "-p",
                str(self.ENV_DIR),
                f"python={self.python_version}",
            ]
        )

        # Install ffmpeg and related codecs from conda forge
        llama_pkg = "llama.cpp" if self.platform == "darwin" else "llama.cpp=*=cuda126*"
        self.run_command(
            [
                "conda",
                "install",
                "-p",
                str(self.ENV_DIR),
                "ffmpeg",
                "cairo",
                "git",
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
                "uv",
                "lua",
                "nodejs",
                llama_pkg,
                "-y",
                "--channel",
                "conda-forge",
            ]
        )

        # Pack the environment
        ext = "zip" if self.platform == "windows" else "tar.gz"
        output_name = f"conda-env-{self.platform}-{self.arch}.{ext}"
        output_path = self.BUILD_DIR / output_name

        self.remove_file(output_path)

        # This is needed to avoid the clobbering of base packages error
        self.run_command(["conda", "list", "-p", str(self.ENV_DIR)])

        self.run_command(
            ["conda-pack", "-p", str(self.ENV_DIR), "-o", str(output_path)]
        )

        logger.info(f"Environment packed successfully to {output_name}")


def main() -> None:
    """Parse CLI arguments and run the requested build step.

    Exposes two steps:
        - ``setup``: Prepare build directories.
        - ``pack``: Create and pack the Conda environment.
    """
    parser = argparse.ArgumentParser(
        description="Build script for Nodetool Electron app and installer"
    )
    parser.add_argument(
        "step",
        choices=[
            "setup",
            "pack",
        ],
        help="Build step to run",
    )
    parser.add_argument(
        "--clean",
        action="store_true",
        help="Clean the build directory before running",
    )
    parser.add_argument(
        "--python-version",
        default=os.environ.get("PYTHON_VERSION", "3.11"),
        help="Python version to use for the conda environment (e.g., 3.11)",
    )

    args = parser.parse_args()

    build = Build(
        clean_build=args.clean,
        python_version=args.python_version,
    )

    step_method = getattr(build, args.step, None)
    if step_method:
        step_method()
    else:
        logger.error(f"Invalid build step: {args.step}")
        sys.exit(1)


if __name__ == "__main__":
    main()
