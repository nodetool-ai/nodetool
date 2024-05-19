import subprocess
from typing import IO
import PIL.Image
import pydub
from io import BytesIO
import tempfile
import numpy as np
import asyncio
import subprocess
import cv2


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


async def create_image_thumbnail(input_io: IO, width: int, height: int) -> BytesIO:
    """
    Generate a thumbnail image from an image using PIL.
    """
    # Read the image from the input BytesIO object
    image = PIL.Image.open(input_io)
    input_io.seek(0)

    # Resize the image to the specified width and height
    image.thumbnail((width, height))

    # Create a new BytesIO object to store the thumbnail image
    output_io = BytesIO()
    image.save(output_io, format="JPEG")

    # Reset the BytesIO object to the beginning
    output_io.seek(0)

    return output_io


async def create_video_thumbnail(input_io: IO, width: int, height: int) -> BytesIO:
    """
    Generate a thumbnail image from a video file using OpenCV.
    """
    # Create a temporary file to store the video
    with tempfile.NamedTemporaryFile() as temp_file:
        # Write the input BytesIO object to the temporary file
        temp_file.write(input_io.read())
        temp_file.flush()
        input_io.seek(0)

        # Use ffmpeg to generate thumbnail
        # select the most representative frame in a given sequence of consecutive frames
        # automatically from the video.
        cmd = [
            "ffmpeg",
            "-i",
            temp_file.name,
            "-vf",
            "thumbnail=300",
            "-frames:v",
            "1",
            "-f",
            "image2pipe",
            "-",
        ]

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

        output, errors = await process.communicate()

        if process.returncode == 0:
            return BytesIO(output)
        else:
            raise Exception(f"ffmpeg error: {errors}")


async def get_video_duration(input_io: BytesIO) -> float | None:
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
        temp_file.write(input_io.read())
        temp_file.flush()
        input_io.seek(0)

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

        output, errors = await process.communicate()

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
