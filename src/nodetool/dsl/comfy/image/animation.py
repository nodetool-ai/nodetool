from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class SaveAnimatedPNG(GraphNode):
    images: list[ImageTensor] | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='list of images to save as animated PNG.')
    filename_prefix: str | GraphNode | tuple[GraphNode, str] = Field(default='ComfyUI', description='Prefix for the filename.')
    fps: float | GraphNode | tuple[GraphNode, str] = Field(default=6.0, description='Frames per second.')
    compress_level: int | GraphNode | tuple[GraphNode, str] = Field(default=4, description='PNG compression level.')
    hidden_fields: dict[str, Any] | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='Hidden fields like prompt and extra PNG information.')
    output_node: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description=None)
    @classmethod
    def get_node_type(cls): return "comfy.image.animation.SaveAnimatedPNG"


from enum import Enum

class SaveAnimatedWEBP(GraphNode):
    images: list[ImageTensor] | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='list of images to save as animated WEBP.')
    filename_prefix: str | GraphNode | tuple[GraphNode, str] = Field(default='ComfyUI', description='Prefix for the filename.')
    fps: float | GraphNode | tuple[GraphNode, str] = Field(default=6.0, description='Frames per second.')
    lossless: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Whether to use lossless compression.')
    quality: int | GraphNode | tuple[GraphNode, str] = Field(default=80, description='Quality of the WEBP.')
    method: Enum | GraphNode | tuple[GraphNode, str] = Field(default='default', description='Compression method to use.')
    hidden_fields: dict[str, Any] | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='Hidden fields like prompt and extra PNG information.')
    output_node: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description=None)
    @classmethod
    def get_node_type(cls): return "comfy.image.animation.SaveAnimatedWEBP"


