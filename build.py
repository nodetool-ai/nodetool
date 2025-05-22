import argparse
import logging
import shutil
import subprocess
import sys
from pathlib import Path
from platform import system, machine
import threading
import subprocess
import threading
from typing import Any, List
import re
from textwrap import dedent
import json
import os

# Set up logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).parent.resolve()


# Write YAML manually since we don't have yaml module
def write_yaml_value(value, f, indent=0):
    if isinstance(value, dict):
        for k, v in value.items():
            f.write(" " * indent + f"{k}:")
            if isinstance(v, (dict, list)):
                f.write("\n")
                write_yaml_value(v, f, indent + 2)
            else:
                f.write(f" {v}\n")
    elif isinstance(value, list):
        for item in value:
            f.write(" " * indent + f"- {item}\n")
    else:
        f.write(" " * indent + f"{value}\n")


class BuildError(Exception):
    """Custom exception for build errors"""

    pass


class Build:
    """Manage building and packaging of the Nodetool application."""
    def __init__(
        self,
        clean_build: bool = False,
        python_version: str = "3.10",
    ):
        """Initialize Build configuration."""
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
        """Execute a shell command and stream output to the logger."""
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
        """Create a directory."""
        logger.info(f"Creating directory: {path}")
        path.mkdir(parents=parents, exist_ok=True)

    def copy_file(self, src: Path, dst: Path) -> None:
        """Copy a file."""
        logger.info(f"Copying file: {src} to {dst}")
        shutil.copy2(src, dst)

    def copy_tree(self, src: Path, dst: Path) -> None:
        """Copy a directory tree."""
        logger.info(f"Copying tree: {src} to {dst}")
        shutil.copytree(src, dst, dirs_exist_ok=True)

    def remove_directory(self, path: Path) -> None:
        """Remove a directory and its contents."""
        logger.info(f"Removing directory: {path}")
        shutil.rmtree(path, ignore_errors=True)

    def remove_file(self, path: Path) -> None:
        """Remove a file."""
        logger.info(f"Removing file: {path}")
        try:
            path.unlink()
        except FileNotFoundError:
            pass

    def move_file(self, src: Path, dst: Path) -> None:
        """Move a file."""
        logger.info(f"Moving file: {src} to {dst}")
        shutil.move(src, dst)

    def setup(self) -> None:
        """Set up the build environment."""

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
        """Create a packed conda environment."""
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
        self.run_command(
            [
                "conda",
                "install",
                "-p",
                str(self.ENV_DIR),
                "ffmpeg",
                "cairo",
                "x264",
                "x265",
                "aom",
                "libopus",
                "libvorbis",
                "lame",
                "pandoc",
                "uv",
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
    """Parse arguments and run the build process."""
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
