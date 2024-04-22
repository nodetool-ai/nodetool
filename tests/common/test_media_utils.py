from io import BytesIO
import os
import tempfile
import cv2
from pydub import AudioSegment

from nodetool.common.media_utils import (
    get_video_duration,
    get_audio_duration,
)

test_mp4 = os.path.join(os.path.dirname(os.path.dirname(__file__)), "test.mp4")


def test_get_audio_duration():
    # Create a small silent audio file in memory for testing
    audio_bytes = BytesIO()

    silence = AudioSegment.silent(duration=2000)
    silence.export(audio_bytes, format="mp3")

    duration = get_audio_duration(audio_bytes)

    assert duration is not None, "Duration should not be None"
    assert isinstance(duration, float), "Duration should be a float"
    assert duration > 0.0, "Duration should be greater than 0.0"


def test_get_video_duration():
    with open(test_mp4, "rb") as f:
        video_bytes = BytesIO(f.read())
        video_bytes.seek(0)
        duration = get_video_duration(video_bytes)

        assert duration is not None, "Duration should not be None"
        assert isinstance(duration, float), "Duration should be a float"
        assert duration > 0.0, "Duration should be greater than 0.0"
