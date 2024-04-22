import subprocess
import pydub
from io import BytesIO
import tempfile
from typing import IO
import cv2
import numpy as np


def create_empty_video(fps: int, width: int, height: int, duration: int, filename: str):
    """
    Create a video file with empty frames.

    Args:
        fps (int): The frames per second of the video.
        duration (int): The duration of the video in seconds.
        width (int): The width of each frame.
        height (int): The height of each frame.i
        filename (str): The filename of the output video file.

    Returns:
        None
    """
    # Calculate the number of frames needed
    num_frames = int(fps * duration)

    # Create a black frame (you can change this to any color or pattern)
    frame = np.zeros((height, width, 3), dtype=np.uint8)

    # Create a VideoWriter object
    fourcc = cv2.VideoWriter_fourcc(*"XVID")  # type: ignore
    out = cv2.VideoWriter(filename, fourcc, fps, (width, height))

    # Write empty frames to the video file
    for _ in range(num_frames):
        out.write(frame)

    # Release the VideoWriter object
    out.release()


def get_video_duration(input_io: BytesIO) -> float | None:
    """
    Get the duration of a media file using ffprobe.

    Args:
        input_io: BytesIO object containing the media file.

    Returns:
        float: The duration of the media file in seconds.
    """
    with tempfile.NamedTemporaryFile() as temp_file:
        cmd = [
            "ffprobe",
            "-v",
            "error",  # Set error log level
            "-show_entries",
            "format=duration",  # Show only the duration entry
            "-of",
            "default=noprint_wrappers=1:nokey=1",  # Output format for the duration
            "-i",
            temp_file.name,  # Read from the temporary file
        ]
        # write the input bytes to the temporary file
        temp_file.write(input_io.getvalue())
        temp_file.flush()

        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

        input_io.seek(0)
        output, errors = process.communicate(timeout=300)

        if process.returncode == 0:
            duration = output.strip()
            if duration:
                try:
                    return float(duration)
                except ValueError as e:
                    print(f"Error parsing duration: {e}")
                    return None
            return None
        else:
            print(f"ffprobe error: {errors}")


def get_audio_duration(source_io: BytesIO):
    """
    Get the duration of an audio file using pydub.

    Args:
        source_io: BytesIO object containing the media file.

    Returns:
        BytesIO: BytesIO object containing the WebM file.
    """
    audio = pydub.AudioSegment.from_file(source_io)
    duration = len(audio) / 1000.0
    return duration
