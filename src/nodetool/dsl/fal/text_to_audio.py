from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class F5TTS(GraphNode):
    """
    F5 TTS (Text-to-Speech) model for generating natural-sounding speech from text with voice cloning capabilities.
    audio, tts, voice-cloning, speech, synthesis, text-to-speech, tts, text-to-audio

    Use cases:
    - Generate natural speech from text
    - Clone and replicate voices
    - Create custom voiceovers
    - Produce multilingual speech content
    - Generate personalized audio content
    """

    gen_text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The text to be converted to speech')
    ref_audio_url: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='URL of the reference audio file to clone the voice from')
    ref_text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Optional reference text. If not provided, ASR will be used')
    model_type: str | GraphNode | tuple[GraphNode, str] = Field(default='F5-TTS', description='Model type to use (F5-TTS or E2-TTS)')
    remove_silence: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Whether to remove silence from the generated audio')

    @classmethod
    def get_node_type(cls): return "fal.text_to_audio.F5TTS"



class MMAudioV2(GraphNode):
    """
    MMAudio V2 generates synchronized audio given text inputs. It can generate sounds described by a prompt.
    audio, generation, synthesis, text-to-audio, synchronization

    Use cases:
    - Generate synchronized audio from text descriptions
    - Create custom sound effects
    - Produce ambient soundscapes
    - Generate audio for multimedia content
    - Create sound design elements
    """

    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to generate the audio for')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The negative prompt to avoid certain elements in the generated audio')
    num_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=25, description='The number of steps to generate the audio for')
    duration: float | GraphNode | tuple[GraphNode, str] = Field(default=8.0, description='The duration of the audio to generate in seconds')
    cfg_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=4.5, description='The strength of Classifier Free Guidance')
    mask_away_clip: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Whether to mask away the clip')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The same seed will output the same audio every time')

    @classmethod
    def get_node_type(cls): return "fal.text_to_audio.MMAudioV2"



class StableAudio(GraphNode):
    """
    Stable Audio generates audio from text prompts. Open source text-to-audio model from fal.ai.
    audio, generation, synthesis, text-to-audio, open-source

    Use cases:
    - Generate custom audio content from text
    - Create background music and sounds
    - Produce audio assets for projects
    - Generate sound effects
    - Create experimental audio content
    """

    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to generate the audio from')
    seconds_start: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The start point of the audio clip to generate')
    seconds_total: int | GraphNode | tuple[GraphNode, str] = Field(default=30, description='The duration of the audio clip to generate in seconds')
    steps: int | GraphNode | tuple[GraphNode, str] = Field(default=100, description='The number of steps to denoise the audio for')

    @classmethod
    def get_node_type(cls): return "fal.text_to_audio.StableAudio"


