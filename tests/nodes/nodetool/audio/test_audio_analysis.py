from io import BytesIO
import pytest
import numpy as np
from pydub import AudioSegment
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import AudioRef, Tensor, ImageRef
from nodetool.nodes.nodetool.audio.analysis import (
    AmplitudeToDB,
    ChromaSTFT,
    DBToAmplitude,
    DBToPower,
    GriffinLim,
    MelSpectrogram,
    MFCC,
    PlotSpectrogram,
    PowertToDB,
    SpectralContrast,
    STFT,
)


dummy_tensor = Tensor.from_numpy(np.random.rand(100, 100))
buffer = BytesIO()
AudioSegment.silent(5000, 44_100).export(buffer, format="mp3")
dummy_audio = AudioRef(data=buffer.getvalue())


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "node, expected_type",
    [
        (AmplitudeToDB(tensor=dummy_tensor), Tensor),
        (ChromaSTFT(audio=dummy_audio), Tensor),
        (DBToAmplitude(tensor=dummy_tensor), Tensor),
        (DBToPower(tensor=dummy_tensor), Tensor),
        (GriffinLim(magnitude_spectrogram=dummy_tensor), Tensor),
        (MelSpectrogram(audio=dummy_audio), Tensor),
        (MFCC(audio=dummy_audio), Tensor),
        (PlotSpectrogram(tensor=dummy_tensor), ImageRef),
        (PowertToDB(tensor=dummy_tensor), Tensor),
        (SpectralContrast(audio=dummy_audio), Tensor),
        (STFT(audio=dummy_audio), Tensor),
    ],
)
async def test_audio_analysis_node(
    context: ProcessingContext, node: BaseNode, expected_type
):
    try:
        result = await node.process(context)
        assert result is not None
        assert isinstance(result, expected_type)
    except Exception as e:
        pytest.fail(f"Error processing {node.__class__.__name__}: {str(e)}")
