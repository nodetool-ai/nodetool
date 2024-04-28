from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

from nodetool.nodes.openai.audio import TtsModel
from nodetool.nodes.openai.audio import Voice

class TextToSpeech(GraphNode):
    model: TtsModel | GraphNode | tuple[GraphNode, str] = Field(default=TtsModel('tts-1'), description=None)
    voice: Voice | GraphNode | tuple[GraphNode, str] = Field(default=Voice('alloy'), description=None)
    input: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    speed: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description=None)
    @classmethod
    def get_node_type(cls): return "openai.audio.TextToSpeech"



class Transcribe(GraphNode):
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None), description='The audio file to transcribe.')
    @classmethod
    def get_node_type(cls): return "openai.audio.Transcribe"



class Translate(GraphNode):
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None), description='The audio file to translate.')
    temperature: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The temperature to use for the translation.')
    @classmethod
    def get_node_type(cls): return "openai.audio.Translate"


