from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class JoinImageWithAlpha(GraphNode):
    """
    The Join Image with Alpha node can be used to combine an image and an alpha mask into a single image with transparency. This is useful for creating images with varying levels of opacity or for preparing images for compositing operations.
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to join with an alpha channel.')
    alpha: Mask | GraphNode | tuple[GraphNode, str] = Field(default=Mask(type='comfy.mask', data=None), description='The alpha channel (mask) to join with the image.')

    @classmethod
    def get_node_type(cls): return "comfy.mask.compositing.JoinImageWithAlpha"


import nodetool.nodes.comfy.mask.compositing

class PorterDuffImageComposite(GraphNode):
    """
    The Porter-Duff Image Composite node can be used to combine two images using various compositing modes. This allows for complex image blending operations, useful for creating layered effects or combining multiple image elements.
    """

    source: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The source image.')
    source_alpha: Mask | GraphNode | tuple[GraphNode, str] = Field(default=Mask(type='comfy.mask', data=None), description='The source alpha (mask).')
    destination: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The destination image.')
    destination_alpha: Mask | GraphNode | tuple[GraphNode, str] = Field(default=Mask(type='comfy.mask', data=None), description='The destination alpha (mask).')
    mode: nodetool.nodes.comfy.mask.compositing.PorterDuffImageComposite.PorterDuffModeEnum = Field(default=nodetool.nodes.comfy.mask.compositing.PorterDuffImageComposite.PorterDuffModeEnum('DST'), description='The Porter-Duff compositing mode to use.')

    @classmethod
    def get_node_type(cls): return "comfy.mask.compositing.PorterDuffImageComposite"



class SplitImageWithAlpha(GraphNode):
    """
    The Split Image with Alpha node can be used to separate an image with an alpha channel into its color components and alpha mask. This is useful when you need to manipulate the image and its transparency separately.
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image with an alpha channel to split.')

    @classmethod
    def get_node_type(cls): return "comfy.mask.compositing.SplitImageWithAlpha"


