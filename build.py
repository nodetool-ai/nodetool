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
import zipfile
from typing import Any, List
import re
from textwrap import dedent

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
        python_version: str = "3.11.10",
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
        self.ELECTRON_DIR = PROJECT_ROOT / "electron"
        self.WEB_DIR = PROJECT_ROOT / "web"

    def download_and_unzip(self, url: str, paths: List[str], target_dir: Path) -> None:
        """Download and extract files from a zip archive."""
        import urllib.request
        from io import BytesIO

        with urllib.request.urlopen(url) as response:
            archive_data = BytesIO(response.read())

        with zipfile.ZipFile(archive_data) as zip_ref:
            for path in paths:
                zip_ref.extract(path, target_dir)
                if "/" in path:
                    self.move_file(target_dir / path, target_dir)

    def run_command(
        self,
        command: list[str],
        cwd: str | Path | None = None,
        env: dict | None = None,
        ignore_error: bool = False,
    ) -> int:
        # Modify conda commands to always activate the environment first
        if command[1] not in ["env", "create"]:
            command = ["conda", "run", "-n", "build_env"] + command

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
        files_to_copy = [
            "package.json",
            "package-lock.json",
            "index.html",
            "index.js",
            "preload.js",
            "electron-builder.json",
        ]
        self.copy_tree(self.ELECTRON_DIR / "resources", self.BUILD_DIR)
        for file in files_to_copy:
            self.copy_file(self.ELECTRON_DIR / file, self.BUILD_DIR)

        self.copy_file(PROJECT_ROOT / "environment.yaml", self.BUILD_DIR)
        build_command = [
            "npm",
            "exec",
            "--",
            "electron-builder",
            "--config",
            "electron-builder.json",
        ]

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

        # Ensure conda-build is available
        self.run_command(["conda", "install", "conda-build", "conda-verify", "-y"])

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
        """Initialize Conda environment."""
        logger.info("Initializing clean conda environment")

        env_name = "build_env"

        # Remove existing environment if it exists
        self.run_command(
            ["conda", "env", "remove", "-n", env_name, "--yes"], ignore_error=True
        )

        # Create fresh environment with necessary packages
        self.run_command(
            [
                "conda",
                "create",
                "-n",
                env_name,
                f"python={self.python_version}",
                "conda-build",
                "conda-verify",
                "--yes",
            ]
        )

        # Remove the explicit activate command since we'll use conda run
        # for all subsequent commands

    def get_version(self) -> str:
        """Get the version of the project."""
        with open(PROJECT_ROOT / "pyproject.toml", "r") as f:
            match = re.search(r'^version = "(.*)"$', f.read(), re.MULTILINE)
            if match:
                return match.group(1)
            else:
                raise BuildError("Version not found in pyproject.toml")

    def ollama(self) -> None:
        """Build conda package for ollama-binary."""
        logger.info("Building ollama-binary conda package")

        ollama_version = "0.3.13"
        ollama_name = "ollama-binary"
        ollama_recipe_dir = self.BUILD_DIR / "conda-recipe-ollama-binary"
        binary_dir = ollama_recipe_dir / "ollama-bin"
        self.create_directory(binary_dir)

        # Windows-specific build script with correct path handling
        if self.platform == "windows":
            ollama_build_script = """
            if not exist "%PREFIX%\\Scripts" mkdir "%PREFIX%\\Scripts"
            copy /Y "%RECIPE_DIR%\\ollama-bin\\*" "%PREFIX%\\Scripts\\"
            """
        else:
            ollama_build_script = """
            #!/bin/bash
            mkdir -p $PREFIX/bin
            cp $RECIPE_DIR/ollama-bin/ollama $PREFIX/bin/
            chmod +x $PREFIX/bin/ollama
            """

        # Download and handle Ollama binaries
        if self.platform == "windows":
            zip_path = binary_dir / "ollama.zip"
            self.run_command(
                [
                    "curl",
                    "-L",
                    f"https://github.com/ollama/ollama/releases/download/v{ollama_version}/ollama-windows-amd64.zip",
                    "-o",
                    str(zip_path),
                ]
            )

            # Extract using Python's zipfile instead of unzip command
            with zipfile.ZipFile(zip_path, "r") as zip_ref:
                zip_ref.extractall(binary_dir)
        elif self.platform == "darwin":
            ollama_binary = binary_dir / "ollama"
            self.run_command(
                [
                    "curl",
                    "-L",
                    f"https://github.com/ollama/ollama/releases/download/v{ollama_version}/ollama-darwin",
                    "-o",
                    str(ollama_binary),
                ]
            )
            self.run_command(["chmod", "+x", str(ollama_binary)])
        else:
            raise BuildError(f"Unsupported platform: {self.platform}")

        ollama_meta = {
            "package": {
                "name": ollama_name,
                "version": ollama_version,
            },
            "build": {
                "binary_relocation": False,
                "detect_binary_files_with_prefix": False,
                "number": 0,
            },
            "about": {
                "home": "https://github.com/ollama/ollama",
                "license": "MIT",
                "summary": "Ollama binary package",
            },
        }

        self.build_conda_package(
            name=ollama_name,
            recipe_dir=ollama_recipe_dir,
            build_script=ollama_build_script,
            meta_yaml=ollama_meta,
        )

    def web(self) -> None:
        """Build web app."""
        logger.info("Building web app")
        self.run_command(["npm", "ci"], cwd=self.WEB_DIR)
        self.run_command(["npm", "run", "build"], cwd=self.WEB_DIR)

        self.copy_tree(self.WEB_DIR / "dist", self.BUILD_DIR / "web")

    def upload(self) -> None:
        """Create conda channel index and upload to S3 with locking mechanism."""
        logger.info("Creating conda channel index")

        # Create a unique lock file name based on timestamp and random string
        import uuid

        lock_file = f"channel-lock-{uuid.uuid4()}.lock"

        try:
            # Try to acquire lock by creating a lock file in S3
            logger.info("Attempting to acquire lock...")
            result = self.run_command(
                [
                    "aws",
                    "s3api",
                    "put-object",
                    "--bucket",
                    "nodetool-conda",
                    "--key",
                    lock_file,
                ],
                ignore_error=True,
            )

            if result != 0:
                raise BuildError(
                    "Failed to acquire lock. Another upload might be in progress."
                )

            # Download current channel metadata
            logger.info("Downloading existing channel metadata")
            channel_dir = self.BUILD_DIR / "channel"
            self.run_command(
                [
                    "aws",
                    "s3",
                    "sync",
                    "s3://nodetool-conda/",
                    str(channel_dir),
                    "--exclude",
                    "*",
                    "--include",
                    "*.json",
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

        finally:
            # Always clean up the lock file
            logger.info("Releasing lock...")
            self.run_command(
                [
                    "aws",
                    "s3api",
                    "delete-object",
                    "--bucket",
                    "nodetool-conda",
                    "--key",
                    lock_file,
                ],
                ignore_error=True,
            )

        logger.info("Channel upload completed successfully")


def main() -> None:
    """Parse arguments and run the build process."""
    parser = argparse.ArgumentParser(
        description="Build script for Nodetool Electron app and installer"
    )
    parser.add_argument(
        "--clean",
        action="store_true",
        help="Clean the build directory before running",
    )
    parser.add_argument(
        "--step",
        choices=[
            "setup",
            "electron",
            "ollama",
            "web",
            "upload",
        ],
        help="Run a specific build step",
    )
    parser.add_argument(
        "--python-version",
        default="3.11.10",
        help="Python version to use for the conda environment (e.g., 3.11.10)",
    )

    args = parser.parse_args()

    # Validate Python version format
    if not re.match(r"^\d+\.\d+\.\d+$", args.python_version):
        logger.error("Invalid Python version format. Use 'X.Y.Z' (e.g., 3.11.10)")
        sys.exit(1)

    build = Build(
        clean_build=args.clean,
        python_version=args.python_version,
    )

    if args.step:
        step_method = getattr(build, args.step, None)
        if step_method:
            step_method()
        else:
            logger.error(f"Invalid build step: {args.step}")
            sys.exit(1)
    else:
        build.setup()
        build.ollama()
        build.web()
        build.upload()
        build.electron()


if __name__ == "__main__":
    main()
