from pydantic import Field
from genflow.metadata.types import AudioRef
from genflow.metadata.types import ImageRef
from genflow.nodes.huggingface import HuggingfaceNode
from genflow.workflows.processing_context import ProcessingContext
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
            model_id=self.model, context=context, params={"inputs": self.inputs}
        )
        audio = await context.audio_from_bytes(result)  # type: ignore
        return audio
