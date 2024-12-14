from io import BytesIO
import os
import tempfile
import cv2
import numpy as np
from pydub import AudioSegment
import pytest

from nodetool.common.media_utils import (
    create_image_thumbnail,
    create_video_thumbnail,
    get_video_duration,
    get_audio_duration,
)

test_mp4 = os.path.join(os.path.dirname(os.path.dirname(__file__)), "test.mp4")
test_jpg = os.path.join(os.path.dirname(os.path.dirname(__file__)), "test.jpg")


def test_get_audio_duration():
    # Create a small silent audio file in memory for testing
    audio_bytes = BytesIO()

    silence = AudioSegment.silent(duration=2000)
    silence.export(audio_bytes, format="mp3")

    duration = get_audio_duration(audio_bytes)

    assert duration is not None, "Duration should not be None"
    assert isinstance(duration, float), "Duration should be a float"
    assert duration > 0.0, "Duration should be greater than 0.0"


@pytest.mark.asyncio
async def test_get_video_duration():
    with open(test_mp4, "rb") as f:
        video_bytes = BytesIO(f.read())
        video_bytes.seek(0)
        duration = await get_video_duration(video_bytes)

        assert duration is not None, "Duration should not be None"
        assert isinstance(duration, float), "Duration should be a float"
        assert duration > 0.0, "Duration should be greater than 0.0"


@pytest.mark.asyncio
async def test_video_thumbnail():
    with open(test_mp4, "rb") as f:
        video_bytes = BytesIO(f.read())
        video_bytes.seek(0)
        thumbnail = await create_video_thumbnail(video_bytes, 512, 512)
        thumbnail.seek(0)

        assert thumbnail is not None, "Thumbnail should not be None"
        assert isinstance(thumbnail, BytesIO), "Thumbnail should be a BytesIO object"
        assert (
            cv2.imdecode(np.frombuffer(thumbnail.read(), np.uint8), cv2.IMREAD_COLOR)
            is not None
        ), "Thumbnail should be a valid image"


@pytest.mark.asyncio
async def test_image_thumbnail():
    with open(test_jpg, "rb") as f:
        image_bytes = BytesIO(f.read())
        image_bytes.seek(0)
        thumbnail = await create_image_thumbnail(image_bytes, 512, 512)
        thumbnail.seek(0)

        assert thumbnail is not None, "Thumbnail should not be None"
        assert isinstance(thumbnail, BytesIO), "Thumbnail should be a BytesIO object"
        assert (
            cv2.imdecode(np.frombuffer(thumbnail.read(), np.uint8), cv2.IMREAD_COLOR)
            is not None
        ), "Thumbnail should be a valid image"
