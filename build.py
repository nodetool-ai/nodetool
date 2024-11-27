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
    def __init__(
        self,
        clean_build: bool = False,
        python_version: str = "3.11",
        publish: bool = False,
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
        self.publish = publish

        self.BUILD_DIR = PROJECT_ROOT / "build"
        self.ELECTRON_DIR = PROJECT_ROOT / "electron"
        self.WEB_DIR = PROJECT_ROOT / "web"
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

        self.initialize_conda_env()

        try:
            self.create_directory(self.BUILD_DIR)
        except BuildError as e:
            logger.error(f"Failed to create build directory: {e}")
            sys.exit(1)

    def electron(self) -> None:
        """Build Electron app."""
        logger.info(f"Building Electron app for {self.platform} ({self.arch})")

        # Create build directory if it doesn't exist
        self.create_directory(self.BUILD_DIR)

        # Copy all files (not directories) from electron folder root
        for file in self.ELECTRON_DIR.glob("*"):
            if file.is_file():
                self.copy_file(file, self.BUILD_DIR / file.name)

        # Copy resources and environment
        self.copy_tree(self.ELECTRON_DIR / "resources", self.BUILD_DIR / "resources")
        self.copy_file(
            PROJECT_ROOT / "requirements.txt",
            self.BUILD_DIR / "requirements.txt",
        )

        # Install dependencies
        self.run_command(["npm", "ci"], cwd=self.BUILD_DIR)

        # Build command
        build_command = [
            "npx",
            "electron-builder",
            "--config",
            "electron-builder.json",
        ]

        if self.publish:
            build_command.extend(["--publish", "always"])

        if self.platform:
            electron_platform = "mac" if self.platform == "darwin" else self.platform
            build_command.append(f"--{electron_platform}")
        if self.arch:
            build_command.append(f"--{self.arch}")

        self.run_command(build_command, cwd=self.BUILD_DIR)
        logger.info("Electron app built successfully")

    def build_conda_package(
        self,
        name: str,
        recipe_dir: Path,
        meta_yaml: dict[str, Any],
        build_script: str | None = None,
        source_path: Path | None = None,
    ) -> None:
        """Build a conda package given the package details."""
        logger.info(f"Building conda package: {name}")

        # Create recipe directory if it doesn't exist
        self.create_directory(recipe_dir)

        # Handle source path if provided
        if source_path:
            meta_yaml["source"] = {"path": str(source_path)}

        # Write build script with Windows-specific handling
        if build_script:
            if self.platform == "windows":
                script_file = "bld.bat"
                build_script = build_script.replace("\n", "\r\n")
            else:
                script_file = "build.sh"

            script_path = recipe_dir / script_file
            with open(
                script_path, "w", newline="\r\n" if self.platform == "windows" else "\n"
            ) as f:
                f.write(dedent(build_script))

            if self.platform != "windows":
                self.run_command(["chmod", "+x", str(script_path)])

        # Write meta.yaml with explicit build requirements
        meta_yaml.setdefault("requirements", {})
        meta_yaml["requirements"].setdefault("build", [])
        meta_yaml["requirements"]["build"].extend(
            [f"python {self.python_version}", "conda-build", "conda-verify"]
        )

        meta_yaml_path = recipe_dir / "meta.yaml"
        with open(
            meta_yaml_path, "w", newline="\r\n" if self.platform == "windows" else "\n"
        ) as f:
            write_yaml_value(meta_yaml, f)

        # Create channel directory
        channel_dir = self.BUILD_DIR / "channel"
        self.create_directory(channel_dir)

        # Build the conda package
        build_command = [
            "conda-build",
            "-c",
            "conda-forge",
            "--no-anaconda-upload",
            "--override-channels",
            str(recipe_dir).replace("\\", "/"),
            "--output-folder",
            str(channel_dir).replace("\\", "/"),
            "--python",
            self.python_version,
        ]

        self.run_command(build_command)
        logger.info(f"Conda package '{name}' built successfully")

    def initialize_conda_env(self) -> None:
        """Initialize base conda environment with required packages."""
        logger.info("Initializing conda base environment")

        # Install necessary packages in base environment
        self.run_command(
            [
                "conda",
                "install",
                "conda-build",
                "conda-verify",
                "--yes",
            ]
        )

    def get_version(self) -> str:
        """Get the version of the project."""
        with open(PROJECT_ROOT / "pyproject.toml", "r") as f:
            match = re.search(r'^version = "(.*)"$', f.read(), re.MULTILINE)
            if match:
                return match.group(1)
            else:
                raise BuildError("Version not found in pyproject.toml")

    def web(self) -> None:
        """Build web app."""
        logger.info("Building web app")
        self.run_command(["npm", "ci"], cwd=self.WEB_DIR)
        self.run_command(["npm", "run", "build"], cwd=self.WEB_DIR)

    def upload(self) -> None:
        """Create conda channel index and upload to S3 with locking mechanism."""
        logger.info("Creating conda channel index")

        # Download current channel
        logger.info("Downloading existing channel")
        channel_dir = self.BUILD_DIR / "channel"

        self.run_command(
            [
                "aws",
                "s3",
                "sync",
                "s3://nodetool-conda/",
                str(channel_dir),
            ],
            ignore_error=True,
        )

        # Create platform-specific directories and move packages
        platform_dirs = {
            "linux": ["linux-64", "linux-aarch64"],
            "darwin": ["osx-64", "osx-arm64"],
            "windows": ["win-64"],
            "noarch": ["noarch"],
        }

        for platform_dirs in platform_dirs.values():
            for dir_name in platform_dirs:
                self.create_directory(channel_dir / dir_name)

        # Move packages to appropriate directories based on their platform/arch
        for package in channel_dir.glob("*.tar.bz2"):
            package_name = package.name
            if "noarch" in package_name:
                target_dir = channel_dir / "noarch"
            else:
                # Determine target directory based on platform and arch
                if self.platform == "darwin":
                    target_dir = channel_dir / f"osx-{self.arch}"
                elif self.platform == "linux":
                    arch_name = "aarch64" if self.arch == "arm64" else "64"
                    target_dir = channel_dir / f"linux-{arch_name}"
                else:  # windows
                    target_dir = channel_dir / "win-64"

            if package.parent != target_dir:
                self.move_file(package, target_dir / package_name)

        # Create channel index
        self.run_command(["conda", "index", str(channel_dir)])

        # Upload only new/modified files
        logger.info("Uploading channel updates to S3")
        self.run_command(
            [
                "aws",
                "s3",
                "sync",
                str(channel_dir) + "/",
                "s3://nodetool-conda/",
                "--size-only",  # Only upload files that differ in size
                "--exact-timestamps",  # Use exact timestamp comparison
            ]
        )

        logger.info("Channel upload completed successfully")

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
        
        # Install ffmpeg from conda forge
        # Install codecs for audio and video
        self.run_command(
            [
                "conda",
                "install",
                "ffmpeg",
                "cairo",
                "libopus",
                "-y",
                "--channel",
                "conda-forge",
            ]
        )

        # Get correct path for pip executable
        pip_exe = "pip.exe" if self.platform == "windows" else "pip"
        scripts_dir = "Scripts" if self.platform == "windows" else "bin"

        # Install requirements directly in conda env
        pip_install_command = [
            str(self.ENV_DIR / scripts_dir / pip_exe),
            "install",
            "-r",
            str(PROJECT_ROOT / "requirements.txt"),
        ]

        # Add PyTorch CUDA index for non-Darwin platforms
        if self.platform != "darwin":
            pip_install_command.extend(
                ["--extra-index-url", "https://download.pytorch.org/whl/cu121"]
            )

        self.run_command(pip_install_command)

        # Add bitsandbytes reinstall for Windows
        if self.platform == "windows":
            self.run_command(
                [
                    str(self.ENV_DIR / scripts_dir / pip_exe),
                    "uninstall",
                    "bitsandbytes",
                    "-y",
                ]
            )
            self.run_command(
                [
                    str(self.ENV_DIR / scripts_dir / pip_exe),
                    "install",
                    "bitsandbytes",
                    "--prefer-binary",
                    "--extra-index-url=https://jllllll.github.io/bitsandbytes-windows-webui",
                ]
            )

        # Pack the environment
        version = self.get_version()
        ext = "zip" if self.platform == "windows" else "tar.gz"
        output_name = f"conda-env-{self.platform}-{self.arch}-{version}.{ext}"
        output_path = self.BUILD_DIR / output_name

        self.remove_file(output_path)

        # This is needed to avoid the clobbering of base packages error
        self.run_command(["conda", "list", "-p", str(self.ENV_DIR)])

        self.run_command(
            ["conda-pack", "-p", str(self.ENV_DIR), "-o", str(output_path)]
        )

        logger.info(f"Environment packed successfully to {output_name}")

        # Upload the packed environment to S3
        logger.info(f"Uploading {output_name} to s3://nodetool-conda/")
        self.run_command(["aws", "s3", "cp", str(output_path), "s3://nodetool-conda/"])


def main() -> None:
    """Parse arguments and run the build process."""
    parser = argparse.ArgumentParser(
        description="Build script for Nodetool Electron app and installer"
    )
    parser.add_argument(
        "step",
        choices=[
            "setup",
            "electron",
            "web",
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
        "--publish",
        action="store_true",
        help="Publish the Electron app",
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
        publish=args.publish,
    )

    step_method = getattr(build, args.step, None)
    if step_method:
        step_method()
    else:
        logger.error(f"Invalid build step: {args.step}")
        sys.exit(1)


if __name__ == "__main__":
    main()
