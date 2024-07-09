import numpy as np
from pydub import AudioSegment
from nodetool.metadata.types import Tensor
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.nodes.nodetool.audio.audio_helpers import (
    numpy_to_audio_segment,
)
from nodetool.metadata.types import AudioRef
from nodetool.workflows.base_node import BaseNode
from pydantic import Field


class Trim(BaseNode):
    """
    Trim an audio file to a specified duration.
    audio, trim, cut

    Use cases:
    - Remove silence from the beginning or end of audio files
    - Extract specific segments from audio files
    - Prepare audio data for machine learning models
    """

    audio: AudioRef = Field(default=AudioRef(), description="The audio file to trim.")
    start: float = Field(
        default=0.0,
        ge=0.0,
        description="The start time of the trimmed audio in seconds.",
    )
    end: float = Field(
        default=0.0, ge=0.0, description="The end time of the trimmed audio in seconds."
    )

    async def process(self, context: ProcessingContext) -> AudioRef:
        audio = await context.audio_to_audio_segment(self.audio)
        audio = audio[self.start * 1000 : self.end * 1000]
        return await context.audio_from_segment(audio)  # type: ignore


class ConvertToTensor(BaseNode):
    """
    Converts an audio file to a tensor for further processing.
    audio, conversion, tensor

    Use cases:
    - Prepare audio data for machine learning models
    - Enable signal processing operations on audio
    - Convert audio to a format suitable for spectral analysisr
    """

    audio: AudioRef = Field(
        default=AudioRef(), description="The audio file to convert to a tensor."
    )

    async def process(self, context: ProcessingContext) -> Tensor:
        audio = await context.audio_to_audio_segment(self.audio)
        samples = np.array(audio.get_array_of_samples().tolist())
        return Tensor.from_numpy(samples)


class CreateSilence(BaseNode):
    """
    Creates a silent audio file with a specified duration.
    audio, silence, empty

    Use cases:
    - Generate placeholder audio files
    - Create audio segments for padding or spacing
    - Add silence to the beginning or end of audio files
    """

    duration: float = Field(
        default=1.0, ge=0.0, description="The duration of the silence in seconds."
    )

    async def process(self, context: ProcessingContext) -> AudioRef:
        audio = AudioSegment.silent(duration=int(self.duration * 1000))
        return await context.audio_from_segment(audio)
