from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class LatentCrop(GraphNode):
    samples: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent'), description='The latent samples to crop.')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the crop.')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The height of the crop.')
    x: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The x-coordinate for the top-left corner of the crop area.')
    y: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The y-coordinate for the top-left corner of the crop area.')
    @classmethod
    def get_node_type(cls): return "comfy.latent.transform.LatentCrop"


from nodetool.nodes.comfy.latent.transform import FlipMethod

class LatentFlip(GraphNode):
    samples: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent'), description='The latent samples to flip.')
    flip_method: FlipMethod | GraphNode | tuple[GraphNode, str] = Field(default=FlipMethod('y-axis: horizontally'), description='The method to use for flipping.')
    @classmethod
    def get_node_type(cls): return "comfy.latent.transform.LatentFlip"


from nodetool.nodes.comfy.latent.transform import Rotation

class LatentRotate(GraphNode):
    samples: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent'), description='The latent samples to rotate.')
    rotation: Rotation | GraphNode | tuple[GraphNode, str] = Field(default=Rotation('none'), description='The degree of rotation to apply.')
    @classmethod
    def get_node_type(cls): return "comfy.latent.transform.LatentRotate"


