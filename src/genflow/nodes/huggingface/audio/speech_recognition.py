from enum import Enum
from pydantic import Field
from genflow.metadata.types import AudioRef
from genflow.metadata.types import ImageRef
from genflow.nodes.huggingface import HuggingfaceNode
from genflow.workflows.processing_context import ProcessingContext


class ModelId(str, Enum):
    OPENAI_WHISPER_LARGE_V3 = "openai/whisper-large-v3"
    OPENAI_WHISPER_LARGE_V2 = "openai/whisper-large-v2"


class AutomaticSpeechRecognition(HuggingfaceNode):
    model: ModelId = Field(
        default=ModelId.OPENAI_WHISPER_LARGE_V3,
        title="Model ID on Huggingface",
        description="The model ID to use for the speech recognition",
    )
    audio: AudioRef = Field(
        default=AudioRef(),
        title="Image",
        description="The input audio to transcribe",
    )

    async def process(self, context: ProcessingContext) -> str:
        audio = await context.to_io(self.audio)
        result = await self.run_huggingface(
            model_id=self.model, context=context, data=audio.read()
        )
        return result["text"]  # type: ignore
