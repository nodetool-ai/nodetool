import argparse
import logging
import os
import shutil
import subprocess
import sys
import venv
from pathlib import Path

# Set up logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Global variables
PROJECT_ROOT = Path(__file__).parent.resolve()
BUILD_DIR = PROJECT_ROOT / "build"
ELECTRON_DIR = PROJECT_ROOT / "electron"
WEB_DIR = PROJECT_ROOT / "web"
SRC_DIR = PROJECT_ROOT / "src"
NODETOOL_DIR = SRC_DIR / "nodetool"
VENV_DIR = BUILD_DIR / "venv"


class BuildError(Exception):
    """Custom exception for build errors"""

    pass


def run_command(command, cwd=None, env=None):
    """Run a shell command and log its output."""
    try:
        logger.info(f"Running command: {command}")
        result = subprocess.run(
            command,
            cwd=cwd,
            shell=True,
            check=True,
            text=True,
            capture_output=True,
            env=env,
        )
        logger.info(result.stdout)
        return result
    except subprocess.CalledProcessError as e:
        logger.error(f"Command failed with error: {e}")
        logger.error(f"Error output: {e.stderr}")
        raise BuildError(f"Command failed: {command}") from e


def check_dependencies():
    """Check if required dependencies are installed"""
    dependencies = ["python", "node", "npm"]
    for dep in dependencies:
        try:
            run_command(f"{dep} --version")
        except BuildError:
            logger.error(f"{dep} is not installed or not in PATH")
            raise BuildError(f"{dep} is required but not found")


def setup_build_environment():
    """Set up the build environment."""
    logger.info("Setting up build environment")
    BUILD_DIR.mkdir(exist_ok=True)
    (BUILD_DIR / "nodetool").mkdir(exist_ok=True)


def create_virtual_environment():
    """Create a virtual environment."""
    logger.info("Creating virtual environment")
    venv.create(VENV_DIR, with_pip=True)


def install_python_dependencies():
    """Install Python dependencies using pip in the virtual environment."""
    logger.info("Installing Python dependencies")
    pip_path = (
        VENV_DIR / "Scripts" / "pip"
        if sys.platform == "win32"
        else VENV_DIR / "bin" / "pip"
    )
    run_command(f"{pip_path} install -r requirements.txt", cwd=PROJECT_ROOT)


def build_react_app():
    """Build the React app."""
    logger.info("Building React app")
    run_command("npm ci", cwd=WEB_DIR)
    run_command("npm run build", cwd=WEB_DIR)


def prepare_electron_app():
    """Prepare the Electron app."""
    logger.info("Preparing Electron app")
    electron_app_dir = BUILD_DIR / "electron-app"
    electron_app_dir.mkdir(exist_ok=True)

    # Copy Electron files
    shutil.copytree(ELECTRON_DIR, electron_app_dir, dirs_exist_ok=True)

    # Copy virtual environment
    shutil.copytree(VENV_DIR, electron_app_dir / "venv", dirs_exist_ok=True)

    # Copy nodetool source
    nodetool_site_packages = (
        electron_app_dir / "venv" / "Lib" / "site-packages" / "nodetool"
    )
    shutil.copytree(NODETOOL_DIR, nodetool_site_packages, dirs_exist_ok=True)

    # Copy React build
    react_public_dir = nodetool_site_packages / "public"
    react_public_dir.mkdir(exist_ok=True)
    shutil.copytree(WEB_DIR / "build", react_public_dir, dirs_exist_ok=True)


def build_electron_app():
    """Build the Electron app."""
    logger.info("Building Electron app")
    electron_app_dir = BUILD_DIR / "electron-app"
    run_command("npm ci", cwd=electron_app_dir)
    run_command("npm run build", cwd=electron_app_dir)


def clean_build():
    """Clean the build directory"""
    logger.info("Cleaning build directory")
    if BUILD_DIR.exists():
        shutil.rmtree(BUILD_DIR)


def run_build_step(step_func):
    """Run a build step with proper error handling"""
    try:
        step_func()
    except BuildError as e:
        logger.error(f"Build step failed: {step_func.__name__}")
        logger.error(str(e))
        sys.exit(1)
    except Exception as e:
        logger.error(f"Unexpected error in {step_func.__name__}: {str(e)}")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description="Build script for Nodetool Electron app"
    )
    parser.add_argument(
        "action",
        choices=[
            "setup",
            "venv",
            "python_deps",
            "react",
            "prepare_electron",
            "build_electron",
            "clean",
            "all",
        ],
        help="Specify which part of the build process to run",
    )
    parser.add_argument(
        "--clean", action="store_true", help="Clean the build directory before running"
    )

    args = parser.parse_args()

    if args.clean:
        run_build_step(clean_build)

    try:
        check_dependencies()

        if args.action == "setup" or args.action == "all":
            run_build_step(setup_build_environment)
        if args.action == "venv" or args.action == "all":
            run_build_step(create_virtual_environment)
        if args.action == "python_deps" or args.action == "all":
            run_build_step(install_python_dependencies)
        if args.action == "react" or args.action == "all":
            run_build_step(build_react_app)
        if args.action == "prepare_electron" or args.action == "all":
            run_build_step(prepare_electron_app)
        if args.action == "build_electron" or args.action == "all":
            run_build_step(build_electron_app)
        if args.action == "clean":
            run_build_step(clean_build)

        if args.action == "all":
            logger.info("Full build completed successfully!")
        else:
            logger.info(f"{args.action} completed successfully!")
    except BuildError as e:
        logger.error(f"Build failed: {str(e)}")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        sys.exit(1)


if __name__ == "__main__":
    main()
