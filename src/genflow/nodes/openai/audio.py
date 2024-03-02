from enum import Enum
from genflow.workflows.genflow_node import GenflowNode
from typing import Literal
from pydantic import Field
from io import BytesIO
from pydub import AudioSegment
from genflow.metadata.types import AudioRef
from genflow.workflows.processing_context import ProcessingContext
from genflow.common.environment import Environment


class CreateSpeech(GenflowNode):
    """
    This node converts text to speech using OpenAI's TTS model.

    ### Applications
    - Creating voiceovers for videos.
    - Creating voiceovers for presentations.
    - Creating voiceovers for podcasts.
    """

    class TtsModel(str, Enum):
        tts_1 = "tts-1"
        tts_1_hd = "tts-1-hd"

    class Voice(str, Enum):
        ALLOY = "alloy"
        ECHO = "echo"
        FABLE = "fable"
        ONYX = "onyx"
        NOVA = "nova"
        SHIMMER = "shimmer"

    model: TtsModel = Field(title="Model", default=TtsModel.tts_1)
    voice: Voice = Field(title="Voice", default=Voice.ALLOY)
    input: str = Field(title="Input", default="")
    speed: float = Field(title="Speed", default=1.0, ge=0.25, le=4.0)

    async def process(self, context: ProcessingContext) -> AudioRef:
        client = Environment.get_openai_client()
        res = await client.audio.speech.create(
            input=self.input,
            model=self.model.value,
            voice=self.voice.value,
            speed=self.speed,
            response_format="mp3",
        )
        segment = AudioSegment.from_mp3(BytesIO(res.content))
        audio = await context.audio_from_segment(segment)  # type: ignore
        return audio


class TranscribeNode(GenflowNode):
    """
    Transcribes an audio file.

    The TranscribeAudioNode converts spoken words in an audio file to written text. It is used for creating written records from audio data and is particularly useful in applications involving data analysis, accessibility, and content creation.

    #### Applications
    - Data Analysis: Transcribed text can be further analyzed to derive insights.
    - Accessibility: Helps in making content available to those with hearing impairments.
    - Content Creation: Useful in creating transcripts for podcasts or interviews.
    """

    audio: AudioRef = Field(
        default=AudioRef(), description="The audio file to transcribe."
    )

    async def process(self, context: ProcessingContext) -> str:
        audio = await context.to_io(self.audio)
        client = Environment.get_openai_client()
        res = await client.audio.transcriptions.create(model="whisper-1", file=audio)
        return res.text


class TranslateNode(GenflowNode):
    """
    Translates an audio to english.
    """

    audio: AudioRef = Field(
        default=AudioRef(), description="The audio file to transcribe."
    )
    temperature: float = Field(
        default=0.0, description="The temperature to use for the translation."
    )

    async def process(self, context: ProcessingContext) -> str:
        audio = await context.to_io(self.audio)
        client = Environment.get_openai_client()
        res = await client.audio.translations.create(
            model="whisper-1", file=audio, temperature=self.temperature
        )
        return res.text
