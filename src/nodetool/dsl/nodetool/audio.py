from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class SaveAudio(GraphNode):
    value: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None), description=None)
    folder: FolderRef | GraphNode | tuple[GraphNode, str] = Field(default=FolderRef(type='folder', uri='', asset_id=None), description='The folder to save the audio file to. ')
    name: str | GraphNode | tuple[GraphNode, str] = Field(default='audio', description='The name of the audio file.')
    @classmethod
    def get_node_type(cls): return "nodetool.audio.SaveAudio"


