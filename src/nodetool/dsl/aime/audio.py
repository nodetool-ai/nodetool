from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

import nodetool.nodes.aime.audio
import nodetool.nodes.aime.audio

class TortoiseTTS(GraphNode):
    """
    Generate high-quality speech from text using the Tortoise TTS API. Features multiple voices and quality presets.
    audio, tts, speech, synthesis, voice

    Use cases:
    - Generate natural-sounding speech
    - Create voiceovers
    - Produce multilingual audio
    - Create character voices
    """

    VoiceType: typing.ClassVar[type] = nodetool.nodes.aime.audio.TortoiseTTS.VoiceType
    PresetType: typing.ClassVar[type] = nodetool.nodes.aime.audio.TortoiseTTS.PresetType
    voice: nodetool.nodes.aime.audio.TortoiseTTS.VoiceType = Field(default=VoiceType.TRAIN_GRACE, description=None)
    preset: nodetool.nodes.aime.audio.TortoiseTTS.PresetType = Field(default=PresetType.STANDARD, description=None)
    text_input: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)

    @classmethod
    def get_node_type(cls): return "aime.audio.TortoiseTTS"


