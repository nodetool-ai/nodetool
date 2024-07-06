from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

from nodetool.nodes.huggingface.audio import ModelId

class AutomaticSpeechRecognition(GraphNode):
    model: ModelId | GraphNode | tuple[GraphNode, str] = Field(default=ModelId('openai/whisper-large-v3'), description='The model ID to use for the speech recognition')
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, temp_id=None), description='The input audio to transcribe')
    @classmethod
    def get_node_type(cls): return "huggingface.audio.AutomaticSpeechRecognition"


from nodetool.nodes.huggingface.audio import ModelId

class TextToAudio(GraphNode):
    model: ModelId | GraphNode | tuple[GraphNode, str] = Field(default=ModelId('facebook/musicgen-small'), description='The model ID to use for the audio generation')
    inputs: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The input text to the model')
    @classmethod
    def get_node_type(cls): return "huggingface.audio.TextToAudio"


from nodetool.nodes.huggingface.audio import ModelId

class TextToSpeech(GraphNode):
    model: ModelId | GraphNode | tuple[GraphNode, str] = Field(default=ModelId('suno/bark'), description='The model ID to use for the image generation')
    inputs: str | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='The input text to the model')
    @classmethod
    def get_node_type(cls): return "huggingface.audio.TextToSpeech"


