from pydantic import Field
from nodetool.metadata.types import AudioRef
from nodetool.metadata.types import ImageRef
from nodetool.providers.huggingface.huggingface_node import HuggingfaceNode
from nodetool.workflows.processing_context import ProcessingContext
from enum import Enum
from pydantic import Field
from nodetool.metadata.types import AudioRef
from nodetool.metadata.types import ImageRef
from nodetool.providers.huggingface.huggingface_node import HuggingfaceNode
from nodetool.workflows.processing_context import ProcessingContext


class TextToSpeech(HuggingfaceNode):
    """
    Text-to-Speech (TTS) is the task of generating natural sounding
    speech given text input. TTS models can be extended to have a single model
    that generates speech for multiple speakers and multiple languages.

    ### Use Cases
    * Text-to-Speech (TTS) models can be used in any speech-enabled application that requires converting text to speech imitating human voice.
    * TTS models are used to create voice assistants on smart devices. These models are a better alternative compared to concatenative methods where the assistant is built by recording sounds and mapping them, since the outputs in TTS models contain elements in natural speech such as emphasis.
    * TTS models are widely used in airport and public transportation announcement systems to convert the announcement of a given text into speech.

    """

    class ModelId(str, Enum):
        FASTSPEECH2_EN_LJSPEECH = "facebook/fastspeech2-en-ljspeech"
        SUNO_BARK = "suno/bark"

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


class TextToAudio(HuggingfaceNode):
    """
    Generate audio from a text input using a Huggingface model.
    audio, text, huggingface
    """

    class ModelId(str, Enum):
        MUSICGEN_SMALL = "facebook/musicgen-small"
        MUSICGEN_MEDIUM = "facebook/musicgen-medium"
        MUSICGEN_LARGE = "facebook/musicgen-large"
        MUSICGEN_MELODY = "facebook/musicgen-melody"
        MUSICGEN_STEREO_SMALL = "facebook/musicgen-stereo-small"
        MUSICGEN_STEREO_LARGE = "facebook/musicgen-stereo-large"

    model: ModelId = Field(
        default=ModelId.MUSICGEN_SMALL,
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


class AutomaticSpeechRecognition(HuggingfaceNode):
    """
    Automatic Speech Recognition (ASR), also known as Speech to Text (STT), is the task of transcribing a given audio to text. It has many applications, such as voice user interfaces.
    asr, speech, audio, huggingface
    """

    class ModelId(str, Enum):
        OPENAI_WHISPER_LARGE_V3 = "openai/whisper-large-v3"
        OPENAI_WHISPER_LARGE_V2 = "openai/whisper-large-v2"

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
