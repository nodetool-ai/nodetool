from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class CropMask(GraphNode):
    """
    The Crop Mask node can be used to crop a mask to a new shape.
    """

    mask: Mask | GraphNode | tuple[GraphNode, str] = Field(default=Mask(type='comfy.mask', data=None), description='The mask to crop.')
    x: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The x position for cropping.')
    y: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The y position for cropping.')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='Width of the crop.')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='Height of the crop.')

    @classmethod
    def get_node_type(cls): return "comfy.mask.CropMask"



class FeatherMask(GraphNode):
    """
    The Feather Mask node can be used to feather a mask.
    """

    mask: Mask | GraphNode | tuple[GraphNode, str] = Field(default=Mask(type='comfy.mask', data=None), description='The mask to feather.')
    left: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Feather amount on the left.')
    top: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Feather amount on the top.')
    right: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Feather amount on the right.')
    bottom: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Feather amount on the bottom.')

    @classmethod
    def get_node_type(cls): return "comfy.mask.FeatherMask"



class GrowMask(GraphNode):
    """
    The Grow Mask node can be used to grow a mask.
    """

    mask: Mask | GraphNode | tuple[GraphNode, str] = Field(default=Mask(type='comfy.mask', data=None), description='The mask to grow.')
    expand: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The amount to expand the mask.')
    tapered_corners: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Whether to taper the corners.')

    @classmethod
    def get_node_type(cls): return "comfy.mask.GrowMask"



class ImageColorToMask(GraphNode):
    """
    The Image Color to Mask node can be used to extract a mask from an image based on a specific color.
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to extract the color mask.')
    color: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The color to use for the mask.')

    @classmethod
    def get_node_type(cls): return "comfy.mask.ImageColorToMask"


import nodetool.nodes.comfy.mask

class ImageToMask(GraphNode):
    """
    The Convert Image yo Mask node can be used to convert a specific channel of an image into a mask.
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to extract the mask.')
    channel: nodetool.nodes.comfy.mask.ImageToMask.ChannelEnum = Field(default=nodetool.nodes.comfy.mask.ImageToMask.ChannelEnum('red'), description='The channel to use for the mask.')

    @classmethod
    def get_node_type(cls): return "comfy.mask.ImageToMask"



class InvertMask(GraphNode):
    """
    The Invert Mask node can be used to invert a mask.
    """

    mask: Mask | GraphNode | tuple[GraphNode, str] = Field(default=Mask(type='comfy.mask', data=None), description='The mask to invert.')

    @classmethod
    def get_node_type(cls): return "comfy.mask.InvertMask"


import nodetool.nodes.comfy.mask

class MaskComposite(GraphNode):
    """
    The Mask Composite node can be used to paste one mask into another.
    """

    destination: Mask | GraphNode | tuple[GraphNode, str] = Field(default=Mask(type='comfy.mask', data=None), description='The destination mask.')
    source: Mask | GraphNode | tuple[GraphNode, str] = Field(default=Mask(type='comfy.mask', data=None), description='The source mask.')
    x: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The x position.')
    y: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The y position.')
    operation: nodetool.nodes.comfy.mask.MaskComposite.OperationEnum = Field(default=nodetool.nodes.comfy.mask.MaskComposite.OperationEnum('multiply'), description='The operation to use.')

    @classmethod
    def get_node_type(cls): return "comfy.mask.MaskComposite"



class MaskToImage(GraphNode):
    """
    The Convert Mask to Image node can be used to convert a mask to a grey scale image.
    """

    mask: Mask | GraphNode | tuple[GraphNode, str] = Field(default=Mask(type='comfy.mask', data=None), description='The mask to convert.')

    @classmethod
    def get_node_type(cls): return "comfy.mask.MaskToImage"



class SolidMask(GraphNode):
    """
    The Solid Mask node can be used to create a solid masking containing a single value.
    """

    value: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The value for the solid mask.')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='Width of the solid mask.')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='Height of the solid mask.')

    @classmethod
    def get_node_type(cls): return "comfy.mask.SolidMask"


