import pytest
from io import BytesIO
from pydub import AudioSegment
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import AudioRef
from nodetool.nodes.lib.audio.pedalboard import (
    Reverb,
    Compress,
    TimeStretch,
    PitchShift,
    NoiseGate,
    LowShelfFilter,
    HighShelfFilter,
    HighPassFilter,
    LowPassFilter,
    PeakFilter,
    Distortion,
    Phaser,
    Delay,
    Gain,
    Limiter,
    Bitcrush,
)

# Create a dummy AudioRef for testing
buffer = BytesIO()
AudioSegment.silent(duration=5000, frame_rate=44100).export(buffer, format="mp3")
dummy_audio = AudioRef(data=buffer.getvalue())


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "node",
    [
        Reverb(
            audio=dummy_audio,
            room_scale=0.5,
            damping=0.5,
            wet_level=0.15,
            dry_level=0.5,
        ),
        Compress(
            audio=dummy_audio, threshold=-20.0, ratio=4.0, attack=5.0, release=50.0
        ),
        TimeStretch(audio=dummy_audio, rate=1.0),
        PitchShift(audio=dummy_audio, semitones=0.0),
        NoiseGate(
            audio=dummy_audio, threshold_db=-50.0, attack_ms=1.0, release_ms=100.0
        ),
        LowShelfFilter(audio=dummy_audio, cutoff_frequency_hz=200.0, gain_db=0.0),
        HighShelfFilter(audio=dummy_audio, cutoff_frequency_hz=5000.0, gain_db=0.0),
        HighPassFilter(audio=dummy_audio, cutoff_frequency_hz=80.0),
        LowPassFilter(audio=dummy_audio, cutoff_frequency_hz=5000.0),
        PeakFilter(audio=dummy_audio, cutoff_frequency_hz=1000.0, q_factor=1.0),
        Distortion(audio=dummy_audio, drive_db=25.0),
        Phaser(
            audio=dummy_audio,
            rate_hz=1.0,
            depth=0.5,
            centre_frequency_hz=1300.0,
            feedback=0.0,
            mix=0.5,
        ),
        Delay(audio=dummy_audio, delay_seconds=0.5, feedback=0.3, mix=0.5),
        Gain(audio=dummy_audio, gain_db=0.0),
        Limiter(audio=dummy_audio, threshold_db=-2.0, release_ms=250.0),
        Bitcrush(audio=dummy_audio, bit_depth=8, sample_rate_reduction=1),
    ],
)
async def test_audio_effects_node(context: ProcessingContext, node: BaseNode):
    try:
        result = await node.process(context)
        assert isinstance(result, AudioRef)
        assert result.data is not None
        assert len(result.data) > 0

    except Exception as e:
        pytest.fail(f"Error processing {node.__class__.__name__}: {str(e)}")
