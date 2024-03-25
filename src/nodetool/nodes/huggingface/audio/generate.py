from pydantic import Field
from nodetool.metadata.types import AudioRef
from nodetool.metadata.types import ImageRef
from nodetool.nodes.huggingface import HuggingfaceNode
from nodetool.workflows.processing_context import ProcessingContext
from enum import Enum


class ModelId(str, Enum):
    FASTSPEECH2_EN_LJSPEECH = "facebook/fastspeech2-en-ljspeech"
    SUNO_BARK = "suno/bark"


class TextToSpeech(HuggingfaceNode):
    model: ModelId = Field(
        default=ModelId.SUNO_BARK,
        title="Model ID on Huggingface",
        description="The model ID to use for the image generation",
    )
    inputs: str = Field(
        title="Inputs",
        description="The input text to the model",
    )

    async def process(self, context: ProcessingContext) -> AudioRef:
        result = await self.run_huggingface(
            model_id=self.model.value, context=context, params={"inputs": self.inputs}
        )
        audio = await context.audio_from_bytes(result)  # type: ignore
        return audio


class TextToAudioModel(str, Enum):
    MUSICGEN_SMALL = "facebook/musicgen-small"
    MUSICGEN_MEDIUM = "facebook/musicgen-medium"
    MUSICGEN_LARGE = "facebook/musicgen-large"
    MUSICGEN_MELODY = "facebook/musicgen-melody"
    MUSICGEN_STEREO_SMALL = "facebook/musicgen-stereo-small"
    MUSICGEN_STEREO_LARGE = "facebook/musicgen-stereo-large"


class TextToAudio(HuggingfaceNode):
    model: TextToAudioModel = Field(
        default=TextToAudioModel.MUSICGEN_SMALL,
        title="Model ID on Huggingface",
        description="The model ID to use for the audio generation",
    )
    inputs: str = Field(
        default="",
        title="Inputs",
        description="The input text to the model",
    )

    async def process(self, context: ProcessingContext) -> AudioRef:
        result = await self.run_huggingface(
            model_id=self.model.value,
            context=context,
            params={
                "inputs": self.inputs,
            },
        )
        audio = await context.audio_from_bytes(result)  # type: ignore
        return audio
