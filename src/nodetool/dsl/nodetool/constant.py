from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class Audio(GraphNode):
    value: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None), description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.constant.Audio"



class Bool(GraphNode):
    value: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.constant.Bool"



class Constant(GraphNode):
    @classmethod
    def get_node_type(cls): return "nodetool.constant.Constant"



class DataFrame(GraphNode):
    value: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, columns=None, data=None), description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.constant.DataFrame"



class Dict(GraphNode):
    value: dict[str, Any] | GraphNode | tuple[GraphNode, str] = Field(default={}, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.constant.Dict"



class Float(GraphNode):
    value: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.constant.Float"



class Image(GraphNode):
    value: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.constant.Image"



class List(GraphNode):
    value: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.constant.List"



class String(GraphNode):
    value: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.constant.String"



class Text(GraphNode):
    value: TextRef | GraphNode | tuple[GraphNode, str] = Field(default=TextRef(type='text', uri='', asset_id=None), description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.constant.Text"



class Video(GraphNode):
    value: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, duration=None, format=None), description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.constant.Video"


