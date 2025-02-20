from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class AudioLDM(GraphNode):
    """
    Generates audio using the AudioLDM model based on text prompts.
    audio, generation, AI, text-to-audio

    Use cases:
    - Create custom music or sound effects from text descriptions
    - Generate background audio for videos, games, or other media
    - Produce audio content for creative projects
    - Explore AI-generated audio for music production or sound design
    """

    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='Techno music with a strong, upbeat tempo and high melodic riffs', description='A text prompt describing the desired audio.')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=10, description='Number of denoising steps. More steps generally improve quality but increase generation time.')
    audio_length_in_s: float | GraphNode | tuple[GraphNode, str] = Field(default=5.0, description='The desired duration of the generated audio in seconds.')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Seed for the random number generator. Use -1 for a random seed.')

    @classmethod
    def get_node_type(cls): return "huggingface.text_to_audio.AudioLDM"



class AudioLDM2(GraphNode):
    """
    Generates audio using the AudioLDM2 model based on text prompts.
    audio, generation, AI, text-to-audio

    Use cases:
    - Create custom sound effects based on textual descriptions
    - Generate background audio for videos or games
    - Produce audio content for multimedia projects
    - Explore AI-generated audio for creative sound design
    """

    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='The sound of a hammer hitting a wooden surface.', description='A text prompt describing the desired audio.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='Low quality.', description="A text prompt describing what you don't want in the audio.")
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=200, description='Number of denoising steps. More steps generally improve quality but increase generation time.')
    audio_length_in_s: float | GraphNode | tuple[GraphNode, str] = Field(default=10.0, description='The desired duration of the generated audio in seconds.')
    num_waveforms_per_prompt: int | GraphNode | tuple[GraphNode, str] = Field(default=3, description='Number of audio samples to generate per prompt.')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Seed for the random number generator. Use -1 for a random seed.')

    @classmethod
    def get_node_type(cls): return "huggingface.text_to_audio.AudioLDM2"



class DanceDiffusion(GraphNode):
    """
    Generates audio using the DanceDiffusion model.
    audio, generation, AI, music, text-to-audio

    Use cases:
    - Create AI-generated music samples
    - Produce background music for videos or games
    - Generate audio content for creative projects
    - Explore AI-composed musical ideas
    """

    audio_length_in_s: float | GraphNode | tuple[GraphNode, str] = Field(default=4.0, description='The desired duration of the generated audio in seconds.')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='Number of denoising steps. More steps generally improve quality but increase generation time.')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Seed for the random number generator. Use -1 for a random seed.')

    @classmethod
    def get_node_type(cls): return "huggingface.text_to_audio.DanceDiffusion"



class MusicGen(GraphNode):
    """
    Generates audio (music or sound effects) from text descriptions.
    audio, music, generation, huggingface, text-to-audio

    Use cases:
    - Create custom background music for videos or games
    - Generate sound effects based on textual descriptions
    - Prototype musical ideas quickly
    """

    model: HFTextToAudio | GraphNode | tuple[GraphNode, str] = Field(default=HFTextToAudio(type='hf.text_to_audio', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The model ID to use for the audio generation')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The input text to the model')
    max_new_tokens: int | GraphNode | tuple[GraphNode, str] = Field(default=1024, description='The maximum number of tokens to generate')

    @classmethod
    def get_node_type(cls): return "huggingface.text_to_audio.MusicGen"



class MusicLDM(GraphNode):
    """
    Generates audio (music or sound effects) from text descriptions.
    audio, music, generation, huggingface, text-to-audio

    Use cases:
    - Create custom background music for videos or games
    - Generate sound effects based on textual descriptions
    - Prototype musical ideas quickly
    """

    model: HFTextToAudio | GraphNode | tuple[GraphNode, str] = Field(default=HFTextToAudio(type='hf.text_to_audio', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The model ID to use for the audio generation')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The input text to the model')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=10, description='The number of inference steps to use for the generation')
    audio_length_in_s: float | GraphNode | tuple[GraphNode, str] = Field(default=5.0, description='The length of the generated audio in seconds')

    @classmethod
    def get_node_type(cls): return "huggingface.text_to_audio.MusicLDM"



class StableAudioNode(GraphNode):
    """
    Generate audio using Stable Audio model based on text prompts. Features high-quality audio synthesis with configurable parameters.
    audio, generation, synthesis, text-to-audio, text-to-audio

    Use cases:
    - Create custom audio content from text
    - Generate background music and sounds
    - Produce audio for multimedia projects
    - Create sound effects and ambience
    - Generate experimental audio content
    """

    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='A peaceful piano melody.', description='A text prompt describing the desired audio.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='Low quality.', description="A text prompt describing what you don't want in the audio.")
    duration: float | GraphNode | tuple[GraphNode, str] = Field(default=10.0, description='The desired duration of the generated audio in seconds.')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=200, description='Number of denoising steps. More steps generally improve quality but increase generation time.')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Seed for the random number generator. Use -1 for a random seed.')

    @classmethod
    def get_node_type(cls): return "huggingface.text_to_audio.StableAudio"


