import argparse
import traceback
import logging
import subprocess
import sys
from pathlib import Path
import platform
import threading
import subprocess
import threading
import tarfile
import zipfile
from typing import List, Optional, Callable
import hashlib
import json

# Set up logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).parent.resolve()
CONDA_ENV = "nodetool"


class BuildError(Exception):
    """Custom exception for build errors"""

    pass


class Build:
    def __init__(
        self,
        in_docker: bool = False,
        clean_build: bool = False,
        platform: Optional[str] = None,
        arch: Optional[str] = None,
    ):
        """Initialize Build configuration."""
        self.in_docker = in_docker
        self.clean_build = clean_build
        self.platform = platform
        self.arch = arch

        if in_docker:
            self.BUILD_DIR = Path("/build")
            self.ELECTRON_DIR = Path("/app/electron")
            self.WEB_DIR = Path("/app/web")
            self.SRC_DIR = Path("/app/src")
        else:
            self.BUILD_DIR = PROJECT_ROOT / "build"
            self.ELECTRON_DIR = PROJECT_ROOT / "electron"
            self.WEB_DIR = PROJECT_ROOT / "web"
            self.SRC_DIR = PROJECT_ROOT / "src"

    def download_and_unzip(self, url: str, paths: List[str], target_dir: Path) -> None:
        """Download and extract files from a zip archive."""
        import urllib.request
        from io import BytesIO

        with urllib.request.urlopen(url) as response:
            archive_data = BytesIO(response.read())

        with zipfile.ZipFile(archive_data) as zip_ref:
            for path in paths:
                zip_ref.extract(path, target_dir)

    def ffmpeg(self) -> None:
        """Download and package FFmpeg binaries."""
        logger.info("Downloading FFmpeg")
        system = platform.system().lower()
        ffmpeg_dir = self.BUILD_DIR / "ffmpeg"
        self.create_directory(ffmpeg_dir)

        if system == "windows":
            url = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"
            paths = [
                "ffmpeg-master-latest-win64-gpl/bin/ffmpeg.exe",
                "ffmpeg-master-latest-win64-gpl/bin/ffprobe.exe",
            ]
            self.download_and_unzip(url, paths, ffmpeg_dir)

        elif system == "darwin":

            self.download_and_unzip(
                "https://evermeet.cx/ffmpeg/ffmpeg-7.0.2.zip", ["ffmpeg"], ffmpeg_dir
            )
            self.download_and_unzip(
                "https://evermeet.cx/ffmpeg/ffprobe-7.0.2.zip", ["ffprobe"], ffmpeg_dir
            )
        else:
            raise BuildError(f"Unsupported platform: {system}")

        # Package FFmpeg binaries
        self.package_component("ffmpeg", ffmpeg_dir)

    def run_command(
        self,
        command: list[str],
        cwd: str | Path | None = None,
        env: dict | None = None,
        in_docker: bool | None = None,
        ignore_error: bool = False,
    ) -> int:
        """Execute a shell command and stream output."""
        should_run_in_docker = in_docker if in_docker is not None else self.in_docker

        if should_run_in_docker:
            command = [
                "docker",
                "run",
                "--rm",
                "-w",
                cwd or "/app",
                "--mount",
                "type=bind,source=/tmp/docker-build,target=/build",
                "nodetool-builder",
            ] + command

        logger.info(" ".join(command))

        process = subprocess.Popen(
            " ".join(command),
            shell=True,
            cwd=None if should_run_in_docker else cwd,
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

    def create_directory(self, path: Path) -> None:
        """Create a directory."""
        self.run_command(["mkdir", str(path)], ignore_error=True)

    def copy_file(self, src: Path, dst: Path) -> None:
        """Copy a file."""
        self.run_command(["cp", str(src), str(dst)])

    def copy_tree(self, src: Path, dst: Path) -> None:
        """Copy a directory tree."""
        self.run_command(["cp", "-r", str(src), str(dst)])

    def remove_directory(self, path: Path) -> None:
        """Remove a directory and its contents."""
        self.run_command(["rm", "-rf", str(path)])

    def remove_file(self, path: Path) -> None:
        """Remove a file."""
        self.run_command(["rm", "-f", str(path)])

    def move_file(self, src: Path, dst: Path) -> None:
        """Move a file."""
        self.run_command(["mv", str(src), str(dst)])

    def setup(self) -> None:
        """Set up the build environment."""
        if self.in_docker:
            logger.info("Running build in Docker container")
            self.run_command(["mkdir", "-p", "/tmp/docker-build"], in_docker=False)
            self.run_command(["chmod", "777", "/tmp/docker-build"], in_docker=False)
            self.run_command(
                [
                    "docker",
                    "build",
                    "-t",
                    "nodetool-builder",
                    "-f",
                    "Dockerfile.build",
                    ".",
                ],
                in_docker=False,
            )
        else:
            logger.info("Running build locally")
            self.initialize_conda_env()

        try:
            self.create_directory(self.BUILD_DIR)
        except BuildError as e:
            logger.error(f"Failed to create build directory: {e}")
            sys.exit(1)

    def ollama(self) -> None:
        """Download and package Ollama."""
        logger.info("Downloading Ollama")
        system = platform.system().lower()
        if system == "windows":
            self.run_command(
                [
                    "curl",
                    "-L",
                    "https://github.com/ollama/ollama/releases/download/v0.3.9/ollama-windows-amd64.zip",
                    "-o",
                    "ollama.zip",
                ]
            )
            self.run_command(
                ["unzip", "ollama.zip", "-d", str(self.BUILD_DIR / "ollama")]
            )
            # remove cuda11 dlls
            self.remove_file(
                self.BUILD_DIR / "ollama" / "lib" / "ollama" / "rocblas.dll"
            )
            self.remove_file(
                self.BUILD_DIR / "ollama" / "lib" / "ollama" / "cublas64_11.dll"
            )
            self.remove_file(
                self.BUILD_DIR / "ollama" / "lib" / "ollama" / "cublasLt64_11.dll"
            )
            self.remove_directory(
                self.BUILD_DIR / "ollama" / "lib" / "ollama" / "runners" / "cuda_v11"
            )
            self.remove_directory(
                self.BUILD_DIR / "ollama" / "lib" / "ollama" / "rocblas"
            )
            self.remove_directory(
                self.BUILD_DIR / "ollama" / "lib" / "ollama" / "runners" / "rocm_v6.1"
            )

            # Package the ollama directory
            self.package_component("ollama", self.BUILD_DIR / "ollama")
        elif system == "darwin":
            self.run_command(
                [
                    "curl",
                    "-L",
                    "https://github.com/ollama/ollama/releases/download/v0.3.9/ollama-darwin",
                    "-o",
                    str(self.BUILD_DIR / "ollama"),
                ]
            )
            self.run_command(["chmod", "+x", str(self.BUILD_DIR / "ollama")])

            # Package the ollama binary
            self.package_component("ollama", self.BUILD_DIR / "ollama")
        else:
            raise BuildError(f"Unsupported platform: {system}")

    def python(self) -> None:
        """Package Python environment."""
        logger.info("Packing Python environment")

        self.run_command(["conda", "install", "-n", CONDA_ENV, "conda-pack", "-y"])

        # Use conda-pack to create an environment directory
        python_env_dir = self.BUILD_DIR / "python_env"
        python_env_tar = self.BUILD_DIR / "python_env.tar"
        if python_env_tar.exists():
            self.remove_file(python_env_tar)

        self.run_command(
            [
                "conda",
                "run",
                "-n",
                CONDA_ENV,
                "conda-pack",
                "-j",
                "8",
                "-o",
                str(python_env_tar),
            ],
        )

        # Package the python_env directory
        self.package_component("python_env.tar", python_env_dir)

        # Copy and package the src directory
        self.copy_tree(self.SRC_DIR, self.BUILD_DIR / "src")
        self.package_component("src", self.BUILD_DIR / "src")

    def react(self) -> None:
        """Build React app."""
        logger.info("Building React app")
        web_dir = str(PROJECT_ROOT / "web")
        self.run_command(["npm", "ci"], cwd=web_dir)
        self.run_command(["npm", "run", "build"], cwd=web_dir)

        # Copy the build output to BUILD_DIR / "web"
        self.copy_tree(self.WEB_DIR / "dist", self.BUILD_DIR / "web")

        # Package the web directory
        self.package_component("web", self.BUILD_DIR / "web")

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

        self.copy_file(PROJECT_ROOT / "requirements.txt", self.BUILD_DIR)

        build_command = [
            "npm",
            "exec",
            "--",
            "electron-builder",
            "--config",
            "electron-builder.json",
        ]

        if self.platform:
            build_command.append(f"--{self.platform}")
        if self.arch:
            build_command.append(f"--{self.arch}")

        self.run_command(build_command, cwd=self.BUILD_DIR)
        logger.info("Electron app built successfully")

    def initialize_conda_env(self) -> None:
        """Initialize Conda environment."""
        logger.info("Initializing clean conda environment")

        # Create new environment
        self.run_command(
            ["conda", "create", "-n", CONDA_ENV, "python=3.11", "-y"], ignore_error=True
        )

    def run_build_step(self, step_func: Callable[[], None]) -> None:
        """Execute a build step and handle errors."""
        try:
            step_func()
        except BuildError as e:
            logger.error(f"Build step failed: {step_func.__name__}")
            logger.error(str(e))
            sys.exit(1)
        except Exception as e:
            logger.error(f"Unexpected error in {step_func.__name__}: {str(e)}")
            logger.error(traceback.format_exc())
            sys.exit(1)

    def run(self) -> None:
        """Run all build steps."""
        build_steps = [
            self.setup,
            self.python,
            self.react,
            self.ffmpeg,
            self.ollama,
            self.electron,
        ]
        try:
            if self.clean_build:
                logger.info("Cleaning build directory")
                self.remove_directory(self.BUILD_DIR)

            for step_func in build_steps:
                self.run_build_step(step_func)

            logger.info("Build completed successfully")
        except BuildError as e:
            logger.error(f"Build failed: {str(e)}")
            sys.exit(1)
        except Exception as e:
            logger.error(f"Unexpected error: {str(e)}")
            logger.error("Stacktrace:")
            logger.error(traceback.format_exc())
            sys.exit(1)

    def compute_hash(self, path: Path) -> str:
        """Compute SHA256 hash of the file or directory content."""
        hash_sha256 = hashlib.sha256()
        if path.is_file():
            with open(path, "rb") as f:
                for chunk in iter(lambda: f.read(4096), b""):
                    hash_sha256.update(chunk)
        elif path.is_dir():
            for subpath in sorted(path.rglob("*")):
                if subpath.is_file():
                    with open(subpath, "rb") as f:
                        for chunk in iter(lambda: f.read(4096), b""):
                            hash_sha256.update(chunk)
        return hash_sha256.hexdigest()

    def package_component(self, name: str, source_dir: Path | None = None) -> None:
        """Package a component directory into an archive and update manifest."""
        logger.info(f"Packing {name}")

        if name.endswith(".tar"):
            archive_path = self.BUILD_DIR / name
        else:
            if source_dir is None:
                raise BuildError("source_dir is required for non-tar archives")

            # Create archive of the source_dir
            archive_name = f"{name}.tar"
            archive_path = self.BUILD_DIR / archive_name

            self.run_command(
                [
                    "tar",
                    "-cf",
                    str(archive_path),
                    "-C",
                    str(source_dir.parent),
                    source_dir.name,
                ]
            )

        # Compute hash of the archive
        component_hash = self.compute_hash(archive_path)

        # Update manifest with the hash
        manifest_path = self.BUILD_DIR / "manifest.json"
        manifest = {}
        if manifest_path.exists():
            with open(manifest_path, "r") as f:
                manifest = json.load(f)

        manifest[name] = component_hash

        with open(manifest_path, "w") as f:
            json.dump(manifest, f, indent=2)

        # Remove the source directory if it's not a .tar file
        if not name.endswith(".tar"):
            self.remove_directory(source_dir)


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
        "--docker", action="store_true", help="Run the build in a Docker container"
    )
    parser.add_argument(
        "--platform",
        choices=["mac", "linux", "win"],
        help="Target platform for the build (mac, linux, or win)",
    )
    parser.add_argument(
        "--arch",
        choices=["x64", "ia32", "armv7l", "arm64"],
        help="Target architecture for the build",
    )
    parser.add_argument(
        "--step",
        choices=["setup", "python", "react", "electron", "ffmpeg", "ollama"],
        help="Run a specific build step",
    )

    args = parser.parse_args()

    build = Build(
        in_docker=args.docker,
        clean_build=args.clean,
        platform=args.platform,
        arch=args.arch,
    )

    if args.step:
        step_method = getattr(build, args.step, None)
        if step_method:
            build.run_build_step(step_method)
        else:
            logger.error(f"Invalid build step: {args.step}")
            sys.exit(1)
    else:
        build.run()


if __name__ == "__main__":
    main()
