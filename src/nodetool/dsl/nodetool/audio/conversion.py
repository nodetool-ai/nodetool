from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class AudioToTensor(GraphNode):
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None), description='The audio file to convert to a tensor.')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.conversion.AudioToTensor"



class TensorToAudio(GraphNode):
    tensor: Tensor | GraphNode | tuple[GraphNode, str] = Field(default=Tensor(type='tensor', value=[], dtype=None), description='The tensor to convert to an audio file.')
    sample_rate: int | GraphNode | tuple[GraphNode, str] = Field(default=44100, description='The sample rate of the audio file.')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.conversion.TensorToAudio"


