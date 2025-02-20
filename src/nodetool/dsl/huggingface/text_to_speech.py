from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class Bark(GraphNode):
    """
    Bark is a text-to-audio model created by Suno. Bark can generate highly realistic, multilingual speech as well as other audio - including music, background noise and simple sound effects. The model can also produce nonverbal communications like laughing, sighing and crying.
    tts, audio, speech, huggingface

    Use cases:
    - Create voice content for apps and websites
    - Develop voice assistants with natural-sounding speech
    - Generate automated announcements for public spaces
    """

    model: HFTextToSpeech | GraphNode | tuple[GraphNode, str] = Field(default=HFTextToSpeech(type='hf.text_to_speech', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The model ID to use for the image generation')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The input text to the model')

    @classmethod
    def get_node_type(cls): return "huggingface.text_to_speech.Bark"



class TextToSpeech(GraphNode):
    """
    A generic Text-to-Speech node that can work with various Hugging Face TTS models.
    tts, audio, speech, huggingface, speak, voice

    Use cases:
    - Generate speech from text for various applications
    - Create voice content for apps, websites, or virtual assistants
    - Produce audio narrations for videos, presentations, or e-learning content
    """

    model: HFTextToSpeech | GraphNode | tuple[GraphNode, str] = Field(default=HFTextToSpeech(type='hf.text_to_speech', repo_id='', path=None, allow_patterns=None, ignore_patterns=None), description='The model ID to use for text-to-speech generation')
    text: str | GraphNode | tuple[GraphNode, str] = Field(default='Hello, this is a test of the text-to-speech system.', description='The text to convert to speech')

    @classmethod
    def get_node_type(cls): return "huggingface.text_to_speech.TextToSpeech"


