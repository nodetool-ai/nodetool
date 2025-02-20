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

    voice: nodetool.nodes.aime.audio.TortoiseTTS.VoiceType = Field(default=nodetool.nodes.aime.audio.TortoiseTTS.VoiceType('train_grace'), description=None)
    preset: nodetool.nodes.aime.audio.TortoiseTTS.PresetType = Field(default=nodetool.nodes.aime.audio.TortoiseTTS.PresetType('standard'), description=None)
    text_input: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)

    @classmethod
    def get_node_type(cls): return "aime.audio.TortoiseTTS"


