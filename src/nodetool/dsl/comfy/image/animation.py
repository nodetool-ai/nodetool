from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class SaveAnimatedPNG(GraphNode):
    """
    Save a list of images as an animated PNG.
    """

    images: list[ImageRef] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='list of images to save as animated PNG.')
    filename_prefix: str | GraphNode | tuple[GraphNode, str] = Field(default='ComfyUI', description='Prefix for the filename.')
    fps: float | GraphNode | tuple[GraphNode, str] = Field(default=6.0, description='Frames per second.')
    compress_level: int | GraphNode | tuple[GraphNode, str] = Field(default=4, description='PNG compression level.')
    hidden_fields: dict[str, Any] | GraphNode | tuple[GraphNode, str] = Field(default={}, description='Hidden fields like prompt and extra PNG information.')

    @classmethod
    def get_node_type(cls): return "comfy.image.animation.SaveAnimatedPNG"


import enum

class SaveAnimatedWEBP(GraphNode):
    """
    Save a list of images as an animated WEBP.
    """

    images: list[ImageRef] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='list of images to save as animated WEBP.')
    filename_prefix: str | GraphNode | tuple[GraphNode, str] = Field(default='ComfyUI', description='Prefix for the filename.')
    fps: float | GraphNode | tuple[GraphNode, str] = Field(default=6.0, description='Frames per second.')
    lossless: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Whether to use lossless compression.')
    quality: int | GraphNode | tuple[GraphNode, str] = Field(default=80, description='Quality of the WEBP.')
    method: enum.SaveAnimatedWEBP.Enum = Field(default=enum.SaveAnimatedWEBP.Enum('default'), description='Compression method to use.')

    @classmethod
    def get_node_type(cls): return "comfy.image.animation.SaveAnimatedWEBP"


