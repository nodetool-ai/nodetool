from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class LatentCrop(GraphNode):
    """
    The Latent Crop node can be used to crop a specific area from latent samples. This operation allows for focusing on particular regions in the latent space, which can be useful for generating or manipulating specific parts of an image.
    """

    samples: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent', data=None), description='The latent samples to crop.')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The width of the crop.')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='The height of the crop.')
    x: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The x-coordinate for the top-left corner of the crop area.')
    y: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The y-coordinate for the top-left corner of the crop area.')

    @classmethod
    def get_node_type(cls): return "comfy.latent.transform.LatentCrop"


import nodetool.nodes.comfy.latent.transform

class LatentFlip(GraphNode):
    """
    The Latent Flip node can be used to flip latent samples either horizontally or vertically. This operation allows for mirror transformations in the latent space, which can create interesting variations of the generated images.
    """

    FlipMethod: typing.ClassVar[type] = nodetool.nodes.comfy.latent.transform.LatentFlip.FlipMethod
    samples: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent', data=None), description='The latent samples to flip.')
    flip_method: nodetool.nodes.comfy.latent.transform.LatentFlip.FlipMethod = Field(default=FlipMethod.HORIZONTAL, description='The method to use for flipping.')

    @classmethod
    def get_node_type(cls): return "comfy.latent.transform.LatentFlip"


import nodetool.nodes.comfy.latent.transform

class LatentRotate(GraphNode):
    """
    The Latent Rotate node can be used to rotate latent samples by a specified degree. This allows for orientation adjustments in the latent space, which can be useful for aligning or reorienting generated images.
    """

    Rotation: typing.ClassVar[type] = nodetool.nodes.comfy.latent.transform.LatentRotate.Rotation
    samples: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent', data=None), description='The latent samples to rotate.')
    rotation: nodetool.nodes.comfy.latent.transform.LatentRotate.Rotation = Field(default=Rotation.NONE, description='The degree of rotation to apply.')

    @classmethod
    def get_node_type(cls): return "comfy.latent.transform.LatentRotate"


