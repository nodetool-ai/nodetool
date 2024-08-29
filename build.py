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
import os

# Set up logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).parent.resolve()
CONDA_ENV = "nodetool-env"


class BuildError(Exception):
    """Custom exception for build errors"""

    pass


class Build:
    def __init__(self, in_docker=False, clean_build=False, platform=None, arch=None):
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

        self.PYTHON_DIR = self.BUILD_DIR / "python"

    def run_command(
        self, command, cwd=None, env=None, in_docker=None, ignore_error=False
    ):
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

        try:
            process = subprocess.Popen(
                command,
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

        except Exception as e:
            logger.error(f"Command failed with error: {e}")
            raise BuildError(f"Command failed: {' '.join(command)}") from e

    def create_directory(self, path):
        self.run_command(["mkdir", str(path)], ignore_error=True)

    def copy_file(self, src, dst):
        self.run_command(["cp", str(src), str(dst)])

    def copy_tree(self, src, dst):
        self.run_command(["cp", "-r", str(src), str(dst)])

    def remove_directory(self, path):
        self.run_command(["rm", "-rf", str(path)])

    def remove_file(self, path):
        self.run_command(["rm", "-f", str(path)])

    def setup_build_environment(self):
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

    def pack_python_env(self):
        logger.info("Packing Python environment")

        self.run_command(
            ["conda", "run", "-n", CONDA_ENV, "pip", "install", "conda-pack"]
        )

        # Set environment variable to prevent bytecode generation
        env = os.environ.copy()
        env["PYTHONDONTWRITEBYTECODE"] = "1"

        # Use conda-pack with exclusions
        self.run_command(
            [
                "conda",
                "pack",
                "-n",
                CONDA_ENV,
                "-j",
                "4",
                "--exclude",
                "*.pyc",
                "--exclude",
                "__pycache__",
                "--exclude",
                "*.pyo",
                "--exclude",
                "*.pyd",
                "--exclude",
                "tests",
                "--exclude",
                "test",
                "-o",
                f"{self.BUILD_DIR}/python_env.tar",
            ],
            env=env,
        )

        # Bundle the source code
        self.run_command(
            ["tar", "cf", f"{self.BUILD_DIR}/nodetool.tar", "src"], cwd=PROJECT_ROOT
        )

    def build_react_app(self):
        logger.info("Building React app")
        web_dir = str(self.BUILD_DIR / "web")
        self.copy_tree(self.WEB_DIR, web_dir)
        self.run_command(["npm", "ci"], cwd=web_dir)
        self.run_command(["npm", "run", "build"], cwd=web_dir)

    def build_electron_app(self):
        logger.info(f"Building Electron app for {self.platform} ({self.arch})")
        files_to_copy = [
            "package.json",
            "package-lock.json",
            "index.html",
            "index.js",
            "electron-builder.json",
        ]
        for file in files_to_copy:
            self.copy_file(self.ELECTRON_DIR / file, self.BUILD_DIR)

        build_command = ["npx", "electron-builder", "--config", "electron-builder.json"]
        if self.platform:
            build_command.append(f"--{self.platform}")
        if self.arch:
            build_command.append(f"--{self.arch}")

        self.run_command(build_command, cwd=self.BUILD_DIR)
        logger.info("Electron app built successfully")

    def initialize_conda_env(self):
        logger.info("Initializing clean conda environment")

        # Create new environment
        self.run_command(
            ["conda", "create", "-n", CONDA_ENV, "python=3.11", "-y"], ignore_error=True
        )

        # Install pip
        # self.run_command(["conda", "install", "-n", CONDA_ENV, "pip", "-y"])
        self.run_command(
            [
                "conda",
                "run",
                "-n",
                CONDA_ENV,
                "pip",
                "install",
                "-r",
                f"{PROJECT_ROOT}/requirements.txt",
                "-v",
                "--no-cache-dir",
            ]
        )

    def run_build_step(self, step_func):
        try:
            step_func()
        except BuildError as e:
            logger.error(f"Build step failed: {step_func.__name__}")
            logger.error(str(e))
            sys.exit(1)
        except Exception as e:
            logger.error(f"Unexpected error in {step_func.__name__}: {str(e)}")
            sys.exit(1)

    def run(self):
        build_steps = [
            self.setup_build_environment,
            self.pack_python_env,
            self.build_react_app,
            self.build_electron_app,
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


def main():
    """
    Main function to orchestrate the build process.

    Command-line arguments:
    - --clean: Option to clean the build directory before running
    - --docker: Option to run the build in a Docker container

    Raises:
        SystemExit: If any part of the build process fails, the script will exit with status code 1.
    """
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

    args = parser.parse_args()

    build = Build(
        in_docker=args.docker,
        clean_build=args.clean,
        platform=args.platform,
        arch=args.arch,
    )

    build.run()


if __name__ == "__main__":
    main()
