from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

from nodetool.nodes.huggingface.audio.generate import TextToAudioModel

class TextToAudio(GraphNode):
    model: TextToAudioModel | GraphNode | tuple[GraphNode, str] = Field(default=TextToAudioModel('facebook/musicgen-small'), description='The model ID to use for the audio generation')
    inputs: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The input text to the model')
    @classmethod
    def get_node_type(cls): return "huggingface.audio.generate.TextToAudio"


from nodetool.nodes.huggingface.audio.generate import ModelId

class TextToSpeech(GraphNode):
    model: ModelId | GraphNode | tuple[GraphNode, str] = Field(default=ModelId('suno/bark'), description='The model ID to use for the image generation')
    inputs: str | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='The input text to the model')
    @classmethod
    def get_node_type(cls): return "huggingface.audio.generate.TextToSpeech"


