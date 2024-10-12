import tempfile
import numpy as np
import pytest
import PIL.Image
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import (
    TextRef,
    VideoRef,
    ImageRef,
    AudioRef,
)
from nodetool.nodes.nodetool.video import (
    ExtractFrames,
    Fps,
    CreateVideo,
    Concat,
    Trim,
    VideoResizeNode,
    Rotate,
    SetSpeed,
    Overlay,
    ColorBalance,
    Denoise,
    Stabilize,
    Sharpness,
    Blur,
    Saturation,
    AddSubtitles,
    Reverse,
    Transition,
    AddAudio,
    ChromaKey,
)
from moviepy.editor import VideoClip
from io import BytesIO
from pydub import AudioSegment


def create_video_bytes(duration=5, fps=24, size=(320, 240)):
    """
    Create a simple video file as bytes.

    :param duration: Duration of the video in seconds
    :param fps: Frames per second
    :param size: Tuple of (width, height) for the video
    :return: Bytes object containing the video file
    """

    def make_frame(t):
        """Generate a frame at time t."""
        frame = np.zeros((size[1], size[0], 3), dtype=np.uint8)
        x = int(size[0] * t / duration)
        y = int(size[1] * t / duration)
        frame[y, x] = [255, 0, 0]  # Red pixel
        return frame

    # Create the video clip
    video = VideoClip(make_frame, duration=duration)

    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as temp_file:
        video.write_videofile(
            temp_file.name, codec="libx264", fps=fps, verbose=False, logger=None
        )
        return temp_file.read()


buffer = BytesIO()
AudioSegment.silent(5000, 44_100).export(buffer, format="mp3")
dummy_audio = AudioRef(data=buffer.getvalue())

dummy_video = VideoRef(data=create_video_bytes())

# Create a dummy ImageRef for testing
buffer = BytesIO()
PIL.Image.new("RGB", (100, 100), color="red").save(buffer, format="PNG")
dummy_image = ImageRef(data=buffer.getvalue())


@pytest.mark.asyncio
async def test_create_video(context: ProcessingContext):
    frames = [dummy_image for _ in range(10)]
    result = await CreateVideo(frames=frames, fps=24).process(context)
    assert isinstance(result, VideoRef)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "node, expected_type",
    [
        (ExtractFrames(video=dummy_video, start=0, end=10), list),
        (Fps(video=dummy_video), float),
        (Concat(video_a=dummy_video, video_b=dummy_video), VideoRef),
        (Trim(video=dummy_video, start_time=0, end_time=10), VideoRef),
        (VideoResizeNode(video=dummy_video, width=640, height=480), VideoRef),
        (Rotate(video=dummy_video, angle=90), VideoRef),
        (SetSpeed(video=dummy_video, speed_factor=1.5), VideoRef),
        (
            Overlay(
                main_video=dummy_video, overlay_video=dummy_video, x=0, y=0, scale=1.0
            ),
            VideoRef,
        ),
        (
            ColorBalance(
                video=dummy_video, red_adjust=1.0, green_adjust=1.0, blue_adjust=1.0
            ),
            VideoRef,
        ),
        (Denoise(video=dummy_video, strength=5.0), VideoRef),
        (Sharpness(video=dummy_video, luma_amount=1.0, chroma_amount=0.5), VideoRef),
        (Blur(video=dummy_video, strength=5.0), VideoRef),
        (Saturation(video=dummy_video, saturation=1.0), VideoRef),
        (Reverse(video=dummy_video), VideoRef),
        (
            Transition(
                video_a=dummy_video,
                video_b=dummy_video,
                transition_type=Transition.TransitionType.fade,
                duration=1.0,
            ),
            VideoRef,
        ),
        (AddAudio(video=dummy_video, audio=dummy_audio), VideoRef),
        (ChromaKey(video=dummy_video, key_color="0x00FF00"), VideoRef),
    ],
)
async def test_video_nodes(context: ProcessingContext, node, expected_type):
    try:
        result = await node.process(context)
        assert isinstance(result, expected_type)
    except Exception as e:
        pytest.fail(f"Error processing {node.__class__.__name__}: {str(e)}")
