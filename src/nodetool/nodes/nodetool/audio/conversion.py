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


class AudioToTensor(BaseNode):
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


class TensorToAudio(BaseNode):
    """
    Converts a tensor object back to an audio file.
    audio, conversion, tensor

    Use cases:
    - Save processed audio data as a playable file
    - Convert generated or modified audio tensors to audio format
    - Output results of audio processing pipelinesr
    """

    tensor: Tensor = Field(
        default=Tensor(), description="The tensor to convert to an audio file."
    )
    sample_rate: int = Field(
        default=44100, ge=0, le=44100, description="The sample rate of the audio file."
    )

    async def process(self, context: ProcessingContext) -> AudioRef:
        audio = numpy_to_audio_segment(self.tensor.to_numpy(), self.sample_rate)
        return await context.audio_from_segment(audio)


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
