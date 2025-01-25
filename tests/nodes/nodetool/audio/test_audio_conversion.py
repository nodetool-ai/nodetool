from io import BytesIO
import pytest
from pydub import AudioSegment
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import AudioRef, NPArray
from nodetool.nodes.lib.audio.conversion import (
    Trim,
    ConvertToArray,
    CreateSilence,
)

buffer = BytesIO()
AudioSegment.silent(5000, 44_100).export(buffer, format="mp3")
dummy_audio = AudioRef(data=buffer.getvalue())


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "node, expected_type",
    [
        (Trim(audio=dummy_audio, start=0.0, end=1.0), AudioRef),
        (ConvertToArray(audio=dummy_audio), NPArray),
        (CreateSilence(duration=1.0), AudioRef),
    ],
)
async def test_audio_conversion_node(
    context: ProcessingContext, node: BaseNode, expected_type
):
    try:
        result = await node.process(context)
        assert result is not None
        assert isinstance(result, expected_type)
    except Exception as e:
        pytest.fail(f"Error processing {node.__class__.__name__}: {str(e)}")
