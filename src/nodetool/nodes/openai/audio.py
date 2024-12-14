import base64
from enum import Enum
from nodetool.workflows.base_node import BaseNode
from pydantic import Field
from io import BytesIO
from pydub import AudioSegment
from nodetool.metadata.types import AudioRef, Provider
from nodetool.workflows.processing_context import ProcessingContext
from openai.types.audio.transcription import Transcription
from openai.types.audio.translation import Translation


class TextToSpeech(BaseNode):
    """
    Converts text to speech using OpenAI TTS models.
    audio, tts, text-to-speech, voice, synthesis

    Use cases:
    - Generate spoken content for videos or podcasts
    - Create voice-overs for presentations
    - Assist visually impaired users with text reading
    - Produce audio versions of written content
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
        res = await context.run_prediction(
            node_id=self._id,
            provider=Provider.OpenAI,
            model=self.model.value,
            params={
                "input": self.input,
                "voice": self.voice,
                "speed": self.speed,
            },
        )

        segment = AudioSegment.from_mp3(BytesIO(res))
        audio = await context.audio_from_segment(segment)  # type: ignore
        return audio


class Transcribe(BaseNode):
    """
    Transcribes speech from audio to text.
    audio, transcription, speech-to-text, stt

    Use cases:
    - Convert recorded meetings or lectures to text
    - Generate subtitles for videos
    - Create searchable archives of audio content
    - Assist hearing-impaired users with audio content
    """

    audio: AudioRef = Field(
        default=AudioRef(), description="The audio file to transcribe."
    )
    temperature: float = Field(
        default=0.0, description="The temperature to use for the transcription."
    )

    async def process(self, context: ProcessingContext) -> str:
        audio_bytes = await context.asset_to_io(self.audio)

        res = await context.run_prediction(
            node_id=self._id,
            provider=Provider.OpenAI,
            model="whisper-1",
            params={
                "file": base64.b64encode(audio_bytes.read()).decode(),
            },
        )

        res = Transcription(**res)

        return res.text


class Translate(BaseNode):
    """
    Translates speech in audio to English text.
    audio, translation, speech-to-text, localization

    Use cases:
    - Translate foreign language audio content to English
    - Create English transcripts of multilingual recordings
    - Assist non-English speakers in understanding audio content
    - Enable cross-language communication in audio formats
    """

    audio: AudioRef = Field(
        default=AudioRef(), description="The audio file to translate."
    )
    temperature: float = Field(
        default=0.0, description="The temperature to use for the translation."
    )

    async def process(self, context: ProcessingContext) -> str:
        audio_bytes = await context.asset_to_io(self.audio)
        response = await context.run_prediction(
            node_id=self._id,
            provider=Provider.OpenAI,
            model="whisper-1",
            params={
                "file": base64.b64encode(audio_bytes.read()).decode(),
                "temperature": self.temperature,
                "translate": True,
            },
        )
        res = Translation(**response)

        return res.text
