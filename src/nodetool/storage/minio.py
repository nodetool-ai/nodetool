import os
import platform
import subprocess
import sys
import threading
import requests


def download_minio():
    # Detect the current platform
    system = platform.system().lower()
    if system == "linux":
        url = "https://dl.min.io/server/minio/release/linux-amd64/minio"
    elif system == "darwin":
        url = "https://dl.min.io/server/minio/release/darwin-amd64/minio"
    elif system == "windows":
        url = "https://dl.min.io/server/minio/release/windows-amd64/minio.exe"
    else:
        raise ValueError(
            "Unsupported platform. This script supports Linux and MacOS only."
        )

    binary_path = os.path.join("bin", os.path.basename(url))

    if os.path.exists(binary_path):
        return binary_path

    # Download the MinIO binary
    response = requests.get(url)

    print(f"Downloading MinIO from {url} to {binary_path}")
    with open(binary_path, "wb") as file:
        file.write(response.content)

    # Make the binary executable
    os.chmod(binary_path, 0o755)

    return binary_path


def stream_output(process: subprocess.Popen) -> None:
    """
    Reads and prints the process's stdout and stderr continuously.
    """
    for line in process.stdout:  # type: ignore
        print(line, end="")


def run_minio_in_background() -> None:
    binary_path = download_minio()
    abs_path = os.path.abspath(binary_path)

    # Ensure the data directory exists
    if not os.path.exists("data"):
        os.mkdir("data")

    process = subprocess.Popen(
        [abs_path, "server", "data"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,  # Redirect stderr to stdout
        text=True,  # Ensures output is in text mode, Python 3.7+
    )

    # Start a thread to continuously read and print MinIO's output
    print("Starting MinIO thread.")
    sys.stdout.flush()
    output_thread = threading.Thread(target=stream_output, args=(process,))
    output_thread.start()

    print("MinIO is running in the background.")
