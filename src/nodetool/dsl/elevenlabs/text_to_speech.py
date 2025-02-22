from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

import nodetool.nodes.elevenlabs.text_to_speech
import nodetool.nodes.elevenlabs.text_to_speech
import nodetool.nodes.elevenlabs.text_to_speech
import nodetool.nodes.elevenlabs.text_to_speech

class TextToSpeech(GraphNode):
    """
    Generate natural-sounding speech using ElevenLabs' advanced text-to-speech technology. Features multiple voices and customizable parameters.
    audio, tts, speech, synthesis, voice

    Use cases:
    - Create professional voiceovers
    - Generate character voices
    - Produce multilingual content
    - Create audiobooks
    - Generate voice content
    """

    VoiceIDEnum: typing.ClassVar[type] = nodetool.nodes.elevenlabs.text_to_speech.TextToSpeech.VoiceIDEnum
    ModelID: typing.ClassVar[type] = nodetool.nodes.elevenlabs.text_to_speech.TextToSpeech.ModelID
    LanguageID: typing.ClassVar[type] = nodetool.nodes.elevenlabs.text_to_speech.TextToSpeech.LanguageID
    TextNormalization: typing.ClassVar[type] = nodetool.nodes.elevenlabs.text_to_speech.TextToSpeech.TextNormalization
    voice: nodetool.nodes.elevenlabs.text_to_speech.TextToSpeech.VoiceIDEnum = Field(default=VoiceIDEnum.ARIA, description='Voice ID to be used for generation')
    text: str | GraphNode | tuple[GraphNode, str] = Field(default='Hello, how are you?', description='The text to convert to speech')
    tts_model_id: nodetool.nodes.elevenlabs.text_to_speech.TextToSpeech.ModelID = Field(default=ModelID.MONOLINGUAL_V1, description='The TTS model to use for generation')
    voice_settings: dict | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Optional voice settings to override defaults')
    language_code: nodetool.nodes.elevenlabs.text_to_speech.TextToSpeech.LanguageID = Field(default=LanguageID.NONE, description='Language code to enforce (only works with Turbo v2.5)')
    optimize_streaming_latency: int | GraphNode | tuple[GraphNode, str] = Field(default=2, description='Latency optimization level (0-4). Higher values trade quality for speed')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='Seed for deterministic generation (0-4294967295). -1 means random')
    text_normalization: nodetool.nodes.elevenlabs.text_to_speech.TextToSpeech.TextNormalization = Field(default=TextNormalization.AUTO, description='Controls text normalization behavior')
    stability: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Voice stability (0-1). Higher values make output more consistent, lower values more varied')
    similarity_boost: float | GraphNode | tuple[GraphNode, str] = Field(default=0.75, description='Similarity to original voice (0-1). Higher values make output closer to original voice')
    style: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='Speaking style emphasis (0-1). Higher values increase style expression')
    use_speaker_boost: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Whether to use speaker boost for clearer, more consistent output')

    @classmethod
    def get_node_type(cls): return "elevenlabs.text_to_speech.TextToSpeech"


