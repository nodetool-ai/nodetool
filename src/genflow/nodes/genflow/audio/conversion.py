import numpy as np
from genflow.metadata.types import Tensor
from genflow.workflows.processing_context import ProcessingContext
from genflow.nodes.genflow.audio.audio_helpers import (
    numpy_to_audio_segment,
)
from genflow.metadata.types import AudioRef
from genflow.workflows.genflow_node import GenflowNode
from pydantic import Field


class AudioToTensorNode(GenflowNode):
    """
    AudioToTensor node transforms an audio file into a tensor, a data structure that can be understood by machine learning algorithms.

    This node is primarily useful for audio data pre-processing, as machine learning algorithms require data in a specific format (like tensors). The resultant tensor contains the raw audio samples ready for further processing. Some of the significant uses of this node are in voice recognition, sound classification, and other audio analysis tasks.

    Applications:
    - Transforming audio files for machine learning tasks.
    - Converting audio into a manageable and processable format for further audio analysis.
    """

    audio: AudioRef = Field(
        default=AudioRef(), description="The audio file to convert to a tensor."
    )

    async def process(self, context: ProcessingContext) -> Tensor:
        audio = await context.to_audio_segment(self.audio)
        samples = np.array(audio.get_array_of_samples().tolist())
        return Tensor.from_numpy(samples)


class TensorToAudioNode(GenflowNode):
    """
    This node converts a numerical tensor object to an audio file.

    A tensor is a mathematical object analogous to but more general than a vector, represented by an array of components that are functions of the coordinates of a space. In this case, it represents the audio data. This node takes such tensor data and transforms it into an audio format.

    The node is handy when dealing with audio data or signals that have been transformed into tensor format for machine learning models or signal processing. The node allows you to convert the tensor back to an audio file. This is particularly essential when you need to listen to the model output or the processed signals.

    Applications:
    - Reverse the output of machine learning models that generate tensor audio data back to an audiofile.
    - Retrieve and listen to the audio signal after audio signal processing done on tensor format.
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
