import subprocess
from typing import IO, Union
import PIL.Image
import pydub
from io import BytesIO
import tempfile
import numpy as np
import asyncio
import cv2
import os

"""
Media Utilities Module

This module provides various utility functions for handling media files, including image and video processing.

Functions:
    create_empty_video: Create a video file with empty frames.
    create_image_thumbnail: Generate a thumbnail image from an image using PIL.
    create_video_thumbnail: Generate a thumbnail image from a video file using OpenCV.
    get_video_duration: Get the duration of a media file using ffprobe.
    get_audio_duration: Get the duration of an audio file using pydub.

The module relies on external libraries such as PIL, OpenCV, pydub, and ffmpeg for media processing tasks.
It includes both synchronous and asynchronous functions to handle different types of media operations efficiently.

Note: Some functions require external command-line tools like ffmpeg and ffprobe to be installed and accessible in the system path.
"""


def create_empty_video(fps: int, width: int, height: int, duration: int, filename: str):
    """
    Create a video file with empty frames.

    Args:
        fps (int): The frames per second of the video.
        duration (int): The duration of the video in seconds.
        width (int): The width of each frame.
        height (int): The height of each frame.
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
    image.convert("RGB").save(output_io, format="JPEG")

    # Reset the BytesIO object to the beginning
    output_io.seek(0)

    return output_io


async def create_video_thumbnail(input_io: IO, width: int, height: int) -> BytesIO:
    """
    Generate a thumbnail image from a video file using OpenCV.
    """
    # Create a temporary file to store the video
    with tempfile.NamedTemporaryFile(delete=False) as temp_file:
        # Write the input BytesIO object to the temporary file
        temp_file.write(input_io.read())
        temp_file.flush()
        input_io.seek(0)

        temp_file_path = temp_file.name  # Store the temporary file path

    try:
        # Use ffmpeg to generate thumbnail
        # select the most representative frame in a given sequence of consecutive frames
        # automatically from the video.
        cmd = [
            "ffmpeg",
            "-i",
            temp_file_path,
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
            raise Exception(f"ffmpeg error: {errors.decode()}")
    finally:
        os.remove(temp_file_path)  # Ensure the temporary file is deleted


async def get_video_duration(input_io: BytesIO) -> Union[float, None]:
    """
    Get the duration of a media file using ffprobe.

    Args:
        input_io: BytesIO object containing the media file.

    Returns:
        float: The duration of the media file in seconds.
    """
    with tempfile.NamedTemporaryFile(delete=False) as temp_file:
        # write the input bytes to the temporary file
        temp_file.write(input_io.read())
        temp_file.flush()
        input_io.seek(0)

        temp_file_path = temp_file.name  # Store the temporary file path

    try:
        cmd = [
            "ffprobe",
            "-v",
            "error",  # Set error log level
            "-show_entries",
            "format=duration",  # Show only the duration entry
            "-of",
            "default=noprint_wrappers=1:nokey=1",  # Output format for the duration
            "-i",
            temp_file_path,  # Read from the temporary file
        ]

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
            print(f"ffprobe error: {errors.decode()}")
            return None
    finally:
        os.remove(temp_file_path)


def get_audio_duration(source_io: BytesIO) -> float:
    """
    Get the duration of an audio file using pydub.

    Args:
        source_io: BytesIO object containing the media file.

    Returns:
        float: The duration of the audio file in seconds.
    """
    audio = pydub.AudioSegment.from_file(source_io)
    duration = len(audio) / 1000.0
    return duration
