from enum import Enum
import pydub
from nodetool.common.openai_nodes import calculate_cost
from nodetool.workflows.base_node import BaseNode
from pydantic import Field
from io import BytesIO
from pydub import AudioSegment
from nodetool.metadata.types import AudioRef
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.common.environment import Environment


class TextToSpeech(BaseNode):
    """
    Converts text into spoken voice using OpenAI TTS models.
    audio, tts, t2s, text-to-speech, voiceover, speak, voice, read
    Returns an audio file from the provided text.
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
        cost = calculate_cost(self.model.value, len(self.input), 0)

        await context.create_prediction(
            provider="openai",
            node_id=self._id,
            node_type=self.get_node_type(),
            model=self.model.value,
            cost=cost,
        )
        segment = AudioSegment.from_mp3(BytesIO(res.content))
        audio = await context.audio_from_segment(segment)  # type: ignore
        return audio


class Transcribe(BaseNode):
    """
    Converts spoken words in an audio file to written text.
    audio, stt, s2t, speech-to-text, transcription, audio-to-text, analysis
    Returns a text of the detected words from the input audio file.
    """

    audio: AudioRef = Field(
        default=AudioRef(), description="The audio file to transcribe."
    )

    async def process(self, context: ProcessingContext) -> str:
        audio_bytes = await context.asset_to_io(self.audio)
        audio_segment: pydub.AudioSegment = pydub.AudioSegment.from_file(audio_bytes)
        audio_bytes.seek(0)

        client = Environment.get_openai_client()
        res = await client.audio.transcriptions.create(
            model="whisper-1", file=("file.mp3", audio_bytes, "audio/mp3")
        )

        await context.create_prediction(
            provider="openai",
            node_id=self._id,
            node_type=self.get_node_type(),
            model="whisper-1",
            cost=calculate_cost("whisper-1", int(audio_segment.duration_seconds)),
        )
        return res.text


class Translate(BaseNode):
    """
    Translates spoken words in an audio file to English text.
    audio, stt, s2t, speech-to-text, translation, english
    Outputs the english translation of an audio file as text.
    """

    audio: AudioRef = Field(
        default=AudioRef(), description="The audio file to translate."
    )
    temperature: float = Field(
        default=0.0, description="The temperature to use for the translation."
    )

    async def process(self, context: ProcessingContext) -> str:
        audio_bytes = await context.asset_to_io(self.audio)
        audio: pydub.AudioSegment = pydub.AudioSegment.from_file(audio_bytes)
        audio_bytes.seek(0)
        client = Environment.get_openai_client()
        res = await client.audio.translations.create(
            model="whisper-1",
            file=("file.mp3", audio_bytes, "audio/mp3"),
            temperature=self.temperature,
        )
        cost = calculate_cost("whisper-1", int(audio.duration_seconds))
        await context.create_prediction(
            provider="openai",
            node_id=self._id,
            node_type=self.get_node_type(),
            model="whisper-1",
            cost=cost,
        )
        return res.text
