from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class ConvertToTensor(GraphNode):
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, temp_id=None), description='The audio file to convert to a tensor.')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.conversion.ConvertToTensor"



class CreateSilence(GraphNode):
    duration: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The duration of the silence in seconds.')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.conversion.CreateSilence"



class Trim(GraphNode):
    audio: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, temp_id=None), description='The audio file to trim.')
    start: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The start time of the trimmed audio in seconds.')
    end: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The end time of the trimmed audio in seconds.')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.conversion.Trim"


