import subprocess
import os
from io import BytesIO


def get_media_duration(file_bytes_io: BytesIO):
    """
    Get the duration of a media file using ffprobe.

    Args:
        file_bytes_io: BytesIO object containing the media file.

    Returns:
        float: The duration of the media file in seconds.
    """
    cmd = [
        "ffprobe",
        "-v",
        "error",  # Set error log level
        "-show_entries",
        "format=duration",  # Show only the duration entry
        "-of",
        "default=noprint_wrappers=1:nokey=1",  # Output format for the duration
        "-i",
        "pipe:0",  # Read from stdin
    ]
    try:
        # Ensure the BytesIO object's pointer is at the beginning
        file_bytes_io.seek(0)
        process = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        output, errors = process.communicate(input=file_bytes_io.read(), timeout=30)  # type: ignore
        if process.returncode == 0:
            duration_str = output.strip()
            if duration_str != "N/A":
                return float(duration_str)
        else:
            print(f"ffprobe error: {errors}")
    except subprocess.TimeoutExpired:
        print("ffprobe command timed out")
    except ValueError as e:
        print(f"Could not convert ffprobe output to float: {e}")
    except Exception as e:
        print(f"Error during ffprobe execution: {str(e)}")
    return None


import subprocess


def repackage_and_get_duration(source_path):
    # workaround to get duration from webm files
    repackaged_path = f"{source_path.rsplit('.', 1)[0]}_repackaged.webm"

    cmd_repackage = ["ffmpeg", "-i", source_path, "-c", "copy", "-y", repackaged_path]

    try:
        process = subprocess.Popen(
            cmd_repackage, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
        )
        _, errors = process.communicate(timeout=300)
        if process.returncode != 0:
            return None
        return get_media_duration(repackaged_path)
    except subprocess.TimeoutExpired:
        print("repackage asset: ffmpeg command timed out")
    except Exception as e:
        print(f"Error during ffmpeg execution: {str(e)}")
    finally:
        if os.path.exists(repackaged_path):
            os.remove(repackaged_path)
    return None
