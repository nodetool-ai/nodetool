import pytest
import numpy as np
from io import BytesIO
from pydub import AudioSegment
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import AudioRef, NPArray
from nodetool.nodes.lib.audio.transform import (
    Concat,
    Normalize,
    OverlayAudio,
    RemoveSilence,
    SliceAudio,
    Tone,
    MonoToStereo,
    StereoToMono,
    Reverse,
    FadeIn,
    FadeOut,
    Repeat,
)

# Create dummy AudioRefs for testing
buffer = BytesIO()
AudioSegment.silent(duration=5000, frame_rate=44100).export(buffer, format="wav")
dummy_audio = AudioRef(data=buffer.getvalue())
dummy_audio_2 = AudioRef(data=buffer.getvalue())


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "node, expected_type",
    [
        (Concat(a=dummy_audio, b=dummy_audio_2), AudioRef),
        (Normalize(audio=dummy_audio), AudioRef),
        (OverlayAudio(a=dummy_audio, b=dummy_audio_2), AudioRef),
        (
            RemoveSilence(
                audio=dummy_audio, min_length=100, threshold=-40, reduction_factor=1.0
            ),
            AudioRef,
        ),
        (SliceAudio(audio=dummy_audio, start=0.0, end=1.0), AudioRef),
        (Tone(frequency=440.0, duration=1.0), NPArray),
        (MonoToStereo(audio=dummy_audio), AudioRef),
        (StereoToMono(audio=dummy_audio, method="average"), AudioRef),
        (Reverse(audio=dummy_audio), AudioRef),
        (FadeIn(audio=dummy_audio, duration=1.0), AudioRef),
        (FadeOut(audio=dummy_audio, duration=1.0), AudioRef),
        (Repeat(audio=dummy_audio, loops=2), AudioRef),
    ],
)
async def test_audio_transform_nodes(context: ProcessingContext, node, expected_type):
    try:
        result = await node.process(context)
        assert isinstance(result, expected_type)
    except Exception as e:
        pytest.fail(f"Error processing {node.__class__.__name__}: {str(e)}")
