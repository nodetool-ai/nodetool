from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class AudioFolder(GraphNode):
    label: str | GraphNode | tuple[GraphNode, str] = Field(default='Input Label', description='The label for this input node.')
    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The parameter name for the workflow.')
    description: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The description for this input node.')
    folder: FolderRef | GraphNode | tuple[GraphNode, str] = Field(default=FolderRef(type='folder', uri='', asset_id=None), description='The folder to use as input.')
    limit: int | GraphNode | tuple[GraphNode, str] = Field(default=1000, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.input.AudioFolder"



class AudioInput(GraphNode):
    label: str | GraphNode | tuple[GraphNode, str] = Field(default='Input Label', description='The label for this input node.')
    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The parameter name for the workflow.')
    description: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The description for this input node.')
    value: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None), description='The audio to use as input.')
    @classmethod
    def get_node_type(cls): return "nodetool.input.AudioInput"



class BoolInput(GraphNode):
    label: str | GraphNode | tuple[GraphNode, str] = Field(default='Input Label', description='The label for this input node.')
    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The parameter name for the workflow.')
    description: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The description for this input node.')
    value: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.input.BoolInput"



class ChatInput(GraphNode):
    label: str | GraphNode | tuple[GraphNode, str] = Field(default='Input Label', description='The label for this input node.')
    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The parameter name for the workflow.')
    description: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The description for this input node.')
    value: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.input.ChatInput"



class ComfyInputImage(GraphNode):
    label: str | GraphNode | tuple[GraphNode, str] = Field(default='Input Label', description='The label for this input node.')
    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The parameter name for the workflow.')
    description: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The description for this input node.')
    value: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='The image to use as input.')
    @classmethod
    def get_node_type(cls): return "nodetool.input.ComfyInputImage"



class FloatInput(GraphNode):
    label: str | GraphNode | tuple[GraphNode, str] = Field(default='Input Label', description='The label for this input node.')
    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The parameter name for the workflow.')
    description: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The description for this input node.')
    value: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)
    min: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description=None)
    max: float | GraphNode | tuple[GraphNode, str] = Field(default=100, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.input.FloatInput"



class Folder(GraphNode):
    label: str | GraphNode | tuple[GraphNode, str] = Field(default='Input Label', description='The label for this input node.')
    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The parameter name for the workflow.')
    description: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The description for this input node.')
    folder: FolderRef | GraphNode | tuple[GraphNode, str] = Field(default=FolderRef(type='folder', uri='', asset_id=None), description='The folder to use as input.')
    limit: int | GraphNode | tuple[GraphNode, str] = Field(default=1000, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.input.Folder"



class GroupInput(GraphNode):
    items: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.input.GroupInput"



class ImageFolder(GraphNode):
    label: str | GraphNode | tuple[GraphNode, str] = Field(default='Input Label', description='The label for this input node.')
    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The parameter name for the workflow.')
    description: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The description for this input node.')
    folder: FolderRef | GraphNode | tuple[GraphNode, str] = Field(default=FolderRef(type='folder', uri='', asset_id=None), description='The folder to use as input.')
    limit: int | GraphNode | tuple[GraphNode, str] = Field(default=1000, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.input.ImageFolder"



class ImageInput(GraphNode):
    label: str | GraphNode | tuple[GraphNode, str] = Field(default='Input Label', description='The label for this input node.')
    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The parameter name for the workflow.')
    description: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The description for this input node.')
    value: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='The image to use as input.')
    @classmethod
    def get_node_type(cls): return "nodetool.input.ImageInput"



class IntInput(GraphNode):
    label: str | GraphNode | tuple[GraphNode, str] = Field(default='Input Label', description='The label for this input node.')
    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The parameter name for the workflow.')
    description: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The description for this input node.')
    value: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description=None)
    min: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description=None)
    max: int | GraphNode | tuple[GraphNode, str] = Field(default=100, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.input.IntInput"



class StringInput(GraphNode):
    label: str | GraphNode | tuple[GraphNode, str] = Field(default='Input Label', description='The label for this input node.')
    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The parameter name for the workflow.')
    description: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The description for this input node.')
    value: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.input.StringInput"



class TextFolder(GraphNode):
    label: str | GraphNode | tuple[GraphNode, str] = Field(default='Input Label', description='The label for this input node.')
    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The parameter name for the workflow.')
    description: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The description for this input node.')
    folder: FolderRef | GraphNode | tuple[GraphNode, str] = Field(default=FolderRef(type='folder', uri='', asset_id=None), description='The folder to use as input.')
    limit: int | GraphNode | tuple[GraphNode, str] = Field(default=1000, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.input.TextFolder"



class TextInput(GraphNode):
    label: str | GraphNode | tuple[GraphNode, str] = Field(default='Input Label', description='The label for this input node.')
    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The parameter name for the workflow.')
    description: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The description for this input node.')
    value: TextRef | GraphNode | tuple[GraphNode, str] = Field(default=TextRef(type='text', uri='', asset_id=None), description='The text to use as input.')
    @classmethod
    def get_node_type(cls): return "nodetool.input.TextInput"



class VideoFolder(GraphNode):
    label: str | GraphNode | tuple[GraphNode, str] = Field(default='Input Label', description='The label for this input node.')
    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The parameter name for the workflow.')
    description: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The description for this input node.')
    folder: FolderRef | GraphNode | tuple[GraphNode, str] = Field(default=FolderRef(type='folder', uri='', asset_id=None), description='The folder to use as input.')
    limit: int | GraphNode | tuple[GraphNode, str] = Field(default=1000, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.input.VideoFolder"



class VideoInput(GraphNode):
    label: str | GraphNode | tuple[GraphNode, str] = Field(default='Input Label', description='The label for this input node.')
    name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The parameter name for the workflow.')
    description: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The description for this input node.')
    value: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, duration=None, format=None), description='The video to use as input.')
    @classmethod
    def get_node_type(cls): return "nodetool.input.VideoInput"


