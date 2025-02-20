from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class EmptyLTXVLatentVideo(GraphNode):
    """
    Generates an empty latent video tensor.
    latent, video, ltxv

    Use cases:
    - Initialize a latent tensor for video generation
    - Prepare inputs for LTXV-based models
    """

    width: int | GraphNode | tuple[GraphNode, str] = Field(default=768, description='Width of the latent video.')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='Height of the latent video.')
    length: int | GraphNode | tuple[GraphNode, str] = Field(default=97, description='Length (frames) of the latent video.')
    batch_size: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Batch size.')

    @classmethod
    def get_node_type(cls): return "comfy.latent.video.EmptyLTXVLatentVideo"



class EmptyMochiLatentVideo(GraphNode):
    """
    The Empty Mochi Latent Video node creates a new set of empty latent
    images specifically formatted for video processing.
    """

    width: int | GraphNode | tuple[GraphNode, str] = Field(default=848, description='The width of the latent video to generate.')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=480, description='The height of the latent video to generate.')
    length: int | GraphNode | tuple[GraphNode, str] = Field(default=25, description='The number of frames in the video.')
    batch_size: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='The batch size of the latent video to generate.')

    @classmethod
    def get_node_type(cls): return "comfy.latent.video.EmptyMochiLatentVideo"


