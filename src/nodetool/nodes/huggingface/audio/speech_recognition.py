from enum import Enum
from pydantic import Field
from nodetool.metadata.types import AudioRef
from nodetool.metadata.types import ImageRef
from nodetool.common.huggingface_node import HuggingfaceNode
from nodetool.workflows.processing_context import ProcessingContext


class ModelId(str, Enum):
    OPENAI_WHISPER_LARGE_V3 = "openai/whisper-large-v3"
    OPENAI_WHISPER_LARGE_V2 = "openai/whisper-large-v2"


class AutomaticSpeechRecognition(HuggingfaceNode):
    """
    Automatic Speech Recognition (ASR), also known as Speech to Text (STT), is the task of transcribing a given audio to text. It has many applications, such as voice user interfaces.
    asr, speech, audio, huggingface
    """

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
        audio = await context.asset_to_io(self.audio)
        result = await self.run_huggingface(
            model_id=self.model, context=context, data=audio.read()
        )
        return result["text"]  # type: ignore
