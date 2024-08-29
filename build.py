import argparse
import traceback
import logging
import os
import shutil
import subprocess
import sys
from pathlib import Path
import platform
import threading
import subprocess
import threading

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

    def run_command(self, command, cwd=None, env=None, in_docker=None):
        should_run_in_docker = in_docker if in_docker is not None else self.in_docker

        if should_run_in_docker:
            command = f"docker run --rm -w {cwd or '/app'} --mount type=bind,source=/tmp/docker-build,target=/build nodetool-builder {command}"

        logger.info(f"Running command: {command}")

        try:
            process = subprocess.Popen(
                command,
                cwd=None if should_run_in_docker else cwd,
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env=env,
                universal_newlines=True,
                bufsize=1,
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

            if return_code != 0:
                raise BuildError(
                    f"Command failed with return code {return_code}: {command}"
                )

            return return_code

        except Exception as e:
            logger.error(f"Command failed with error: {e}")
            raise BuildError(f"Command failed: {command}") from e

    def create_directory(self, path):
        self.run_command(f"mkdir -p {path}")

    def copy_file(self, src, dst):
        self.run_command(f"cp {src} {dst}")

    def copy_tree(self, src, dst):
        self.run_command(f"cp -r {src} {dst}")

    def move_directory(self, src, dst):
        self.run_command(f"mv {src} {dst}")

    def remove_directory(self, path):
        self.run_command(f"rm -rf {path}")

    def remove_file(self, path):
        self.run_command(f"rm -f {path}")

    def setup_build_environment(self):
        if self.in_docker:
            logger.info("Running build in Docker container")
            self.run_command("mkdir -p /tmp/docker-build", in_docker=False)
            self.run_command("chmod 777 /tmp/docker-build", in_docker=False)
            self.run_command(
                "docker build -t nodetool-builder -f Dockerfile.build .",
                in_docker=False,
            )
        else:
            logger.info("Running build locally")
            self.initialize_conda_env()

        self.create_directory(self.BUILD_DIR)

    def pack_python_env(self):
        logger.info("Packing Python environment")

        self.run_command(
            f"conda run conda-pack --ignore-editable-packages -o {self.BUILD_DIR}/python_env.tar"
        )
        self.create_directory(self.PYTHON_DIR)
        self.run_command(
            f"tar -xf {self.BUILD_DIR}/python_env.tar -C {self.PYTHON_DIR}"
        )
        self.remove_file(f"{self.BUILD_DIR}/python_env.tar")

    def add_nodetool_src(self):
        logger.info("Adding Nodetool source code")
        self.copy_tree(self.SRC_DIR, self.BUILD_DIR / "src")

    def build_react_app(self):
        logger.info("Building React app")
        web_dir = str(self.BUILD_DIR / "web")
        self.copy_tree(self.WEB_DIR, web_dir)
        self.run_command("npm ci", cwd=web_dir)
        self.run_command("npx vite build", cwd=web_dir)

    def build_electron_app(self):
        logger.info(f"Building Electron app for {self.platform} ({self.arch})")
        # self.run_command("npm ci", cwd=self.ELECTRON_DIR)
        files_to_copy = [
            "package.json",
            "index.html",
            "index.js",
            "electron-builder.json",
            "conda-unpack.sh",
            "conda-unpack.bat",
            "conda-unpack.nsh",
        ]
        for file in files_to_copy:
            self.copy_file(self.ELECTRON_DIR / file, self.BUILD_DIR)

        build_command = "npx electron-builder --config electron-builder.json"
        if self.platform:
            build_command += f" --{self.platform}"
        if self.arch:
            build_command += f" --{self.arch}"

        self.run_command(build_command, cwd=self.BUILD_DIR)
        logger.info("Electron app built successfully")

    def initialize_conda_env(self):
        logger.info("Initializing clean conda environment")

        # Remove existing environment if it exists
        self.run_command(f"conda env remove -n {CONDA_ENV} -y")

        # Create new environment
        self.run_command(f"conda create -n {CONDA_ENV} python=3.11 -y")

        # Activate environment and install required packages
        activate_cmd = f"source $(conda info --base)/etc/profile.d/conda.sh && conda activate {CONDA_ENV} &&"
        self.run_command(
            f"{activate_cmd} pip install -r {PROJECT_ROOT}/requirements.txt"
        )
        self.run_command(f"{activate_cmd} pip install conda-pack")

        # Update the current process's environment to use the new conda env
        os.environ["CONDA_DEFAULT_ENV"] = CONDA_ENV
        os.environ["CONDA_PREFIX"] = subprocess.check_output(
            f"{activate_cmd} echo $CONDA_PREFIX", shell=True, text=True
        ).strip()

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
            self.add_nodetool_src,
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

    This function parses command-line arguments to determine which build steps to run.
    It supports running individual build steps or the entire build process.
    The function also handles cleaning the build directory if requested and
    provides appropriate error handling and logging throughout the build process.

    Command-line arguments:
    - --clean: Option to clean the build directory before running
    - --docker: Option to run the build in a Docker container
    - --init-conda: Option to initialize a clean conda environment before building

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
    parser.add_argument(
        "--init-conda",
        action="store_true",
        help="Initialize a clean conda environment before building",
    )

    args = parser.parse_args()

    build = Build(
        in_docker=args.docker,
        clean_build=args.clean,
        platform=args.platform,
        arch=args.arch,
    )

    if args.init_conda:
        build.initialize_conda_env()

    build.run()


if __name__ == "__main__":
    main()
