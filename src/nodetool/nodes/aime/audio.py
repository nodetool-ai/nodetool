from enum import Enum
from nodetool.common.environment import Environment
from nodetool.providers.aime.types import Progress
from nodetool.workflows.base_node import BaseNode
from pydantic import Field
from nodetool.metadata.types import Provider, AudioRef
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.providers.aime.prediction import fetch_auth_key
from nodetool.workflows.types import NodeProgress


class VoiceType(str, Enum):
    """Voice options for text-to-speech"""

    TRAIN_GRACE = "train_grace"
    TRAIN_DAWS = "train_daws"
    ANGIE = "angie"
    EMMA = "emma"
    FREEMAN = "freeman"
    JLAW = "jlaw"
    DENIRO = "deniro"
    TRAIN_ATKINS = "train_atkins"
    TRAIN_DREAMS = "train_dreams"
    TRAIN_EMPIRE = "train_empire"
    TRAIN_KENNARD = "train_kennard"
    TRAIN_LESCAULT = "train_lescault"
    TRAIN_MOUSE = "train_mouse"


class PresetType(str, Enum):
    """Preset options for generation quality"""

    ULTRA_FAST = "ultra_fast"
    FAST = "fast"
    STANDARD = "standard"
    HIGH_QUALITY = "high_quality"


class TortoiseTTS(BaseNode):
    """
    Generate high-quality speech from text using the Tortoise TTS API. Features multiple voices and quality presets.
    audio, tts, speech, synthesis, voice

    Use cases:
    - Generate natural-sounding speech
    - Create voiceovers
    - Produce multilingual audio
    - Create character voices
    """

    voice: VoiceType = Field(title="Voice", default=VoiceType.TRAIN_GRACE)
    preset: PresetType = Field(title="Preset", default=PresetType.STANDARD)
    text_input: str = Field(title="Text to Translate", default="")

    @classmethod
    def get_title(cls) -> str:
        return "Tortoise TTS"

    @classmethod
    def get_basic_fields(cls) -> list[str]:
        return ["text_input"]

    async def process(self, context: ProcessingContext) -> AudioRef:
        payload = {
            "language": "eng",
            "voice": self.voice.value,
            "preset": self.preset.value,
            "text": self.text_input,
        }

        print(f"Running AIME prediction with payload {payload}")

        def progress_callback(progress: Progress):
            context.post_message(
                NodeProgress(
                    node_id=self._id,
                    progress=progress.progress,
                    total=100,
                )
            )

        response = await context.run_prediction(
            node_id=self._id,
            provider=Provider.AIME,
            model="tts_tortoise",
            params={
                "data": payload,
                "progress_callback": progress_callback,
            },
        )

        b64 = response.get("audio_output").split(",")[1]
        return await context.audio_from_base64(b64)
