from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class AudioOutput(GraphNode):
    label: str | GraphNode | tuple[GraphNode, str] = Field(default='Output Label', description='The label for this output node.')
    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The parameter name for the workflow.')
    description: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The description for this output node.')
    value: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None), description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.output.AudioOutput"



class BoolOutput(GraphNode):
    label: str | GraphNode | tuple[GraphNode, str] = Field(default='Output Label', description='The label for this output node.')
    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The parameter name for the workflow.')
    description: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The description for this output node.')
    value: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.output.BoolOutput"



class ChatOutput(GraphNode):
    label: str | GraphNode | tuple[GraphNode, str] = Field(default='Output Label', description='The label for this output node.')
    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The parameter name for the workflow.')
    description: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The description for this output node.')
    value: list[ThreadMessage] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='The messages to display in the chat.')
    @classmethod
    def get_node_type(cls): return "nodetool.output.ChatOutput"



class ComfyImageOutput(GraphNode):
    label: str | GraphNode | tuple[GraphNode, str] = Field(default='Output Label', description='The label for this output node.')
    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The parameter name for the workflow.')
    description: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The description for this output node.')
    value: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(default=ImageTensor(type='comfy.image_tensor'), description='A raw image tensor.')
    @classmethod
    def get_node_type(cls): return "nodetool.output.ComfyImageOutput"



class DataframeOutput(GraphNode):
    label: str | GraphNode | tuple[GraphNode, str] = Field(default='Output Label', description='The label for this output node.')
    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The parameter name for the workflow.')
    description: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The description for this output node.')
    value: DataFrame | GraphNode | tuple[GraphNode, str] = Field(default=DataFrame(type='dataframe', uri='', asset_id=None, columns=None, data=None), description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.output.DataframeOutput"



class DictOutput(GraphNode):
    label: str | GraphNode | tuple[GraphNode, str] = Field(default='Output Label', description='The label for this output node.')
    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The parameter name for the workflow.')
    description: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The description for this output node.')
    value: dict[str, Any] | GraphNode | tuple[GraphNode, str] = Field(default={}, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.output.DictOutput"



class FloatOutput(GraphNode):
    label: str | GraphNode | tuple[GraphNode, str] = Field(default='Output Label', description='The label for this output node.')
    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The parameter name for the workflow.')
    description: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The description for this output node.')
    value: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.output.FloatOutput"



class GroupOutput(GraphNode):
    input: Any | GraphNode | tuple[GraphNode, str] = Field(default=None, description=None)
    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.output.GroupOutput"



class ImageListOutput(GraphNode):
    label: str | GraphNode | tuple[GraphNode, str] = Field(default='Output Label', description='The label for this output node.')
    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The parameter name for the workflow.')
    description: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The description for this output node.')
    value: list[ImageRef] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='The images to display.')
    @classmethod
    def get_node_type(cls): return "nodetool.output.ImageListOutput"



class ImageOutput(GraphNode):
    label: str | GraphNode | tuple[GraphNode, str] = Field(default='Output Label', description='The label for this output node.')
    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The parameter name for the workflow.')
    description: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The description for this output node.')
    value: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.output.ImageOutput"



class IntOutput(GraphNode):
    label: str | GraphNode | tuple[GraphNode, str] = Field(default='Output Label', description='The label for this output node.')
    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The parameter name for the workflow.')
    description: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The description for this output node.')
    value: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.output.IntOutput"



class ListOutput(GraphNode):
    label: str | GraphNode | tuple[GraphNode, str] = Field(default='Output Label', description='The label for this output node.')
    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The parameter name for the workflow.')
    description: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The description for this output node.')
    value: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.output.ListOutput"



class ModelOutput(GraphNode):
    label: str | GraphNode | tuple[GraphNode, str] = Field(default='Output Label', description='The label for this output node.')
    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The parameter name for the workflow.')
    description: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The description for this output node.')
    value: ModelRef | GraphNode | tuple[GraphNode, str] = Field(default=ModelRef(type='model_ref', uri='', asset_id=None), description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.output.ModelOutput"



class StringOutput(GraphNode):
    label: str | GraphNode | tuple[GraphNode, str] = Field(default='Output Label', description='The label for this output node.')
    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The parameter name for the workflow.')
    description: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The description for this output node.')
    value: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.output.StringOutput"



class TensorOutput(GraphNode):
    label: str | GraphNode | tuple[GraphNode, str] = Field(default='Output Label', description='The label for this output node.')
    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The parameter name for the workflow.')
    description: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The description for this output node.')
    value: Tensor | GraphNode | tuple[GraphNode, str] = Field(default=Tensor(type='tensor', value=[], dtype=None), description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.output.TensorOutput"



class TextOutput(GraphNode):
    label: str | GraphNode | tuple[GraphNode, str] = Field(default='Output Label', description='The label for this output node.')
    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The parameter name for the workflow.')
    description: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The description for this output node.')
    value: TextRef | GraphNode | tuple[GraphNode, str] = Field(default=TextRef(type='text', uri='', asset_id=None), description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.output.TextOutput"



class VideoOutput(GraphNode):
    label: str | GraphNode | tuple[GraphNode, str] = Field(default='Output Label', description='The label for this output node.')
    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The parameter name for the workflow.')
    description: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The description for this output node.')
    value: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, duration=None, format=None), description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.output.VideoOutput"


