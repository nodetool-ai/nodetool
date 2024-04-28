from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class CropMask(GraphNode):
    mask: Mask | GraphNode | tuple[GraphNode, str] = Field(default=Mask(type='comfy.mask'), description='The mask to crop.')
    x: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The x position for cropping.')
    y: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The y position for cropping.')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='Width of the crop.')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='Height of the crop.')
    @classmethod
    def get_node_type(cls): return "comfy.mask.CropMask"



class FeatherMask(GraphNode):
    mask: Mask | GraphNode | tuple[GraphNode, str] = Field(default=Mask(type='comfy.mask'), description='The mask to feather.')
    left: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Feather amount on the left.')
    top: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Feather amount on the top.')
    right: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Feather amount on the right.')
    bottom: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Feather amount on the bottom.')
    @classmethod
    def get_node_type(cls): return "comfy.mask.FeatherMask"



class GrowMask(GraphNode):
    mask: Mask | GraphNode | tuple[GraphNode, str] = Field(default=Mask(type='comfy.mask'), description='The mask to grow.')
    expand: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The amount to expand the mask.')
    tapered_corners: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Whether to taper the corners.')
    @classmethod
    def get_node_type(cls): return "comfy.mask.GrowMask"



class ImageColorToMask(GraphNode):
    image: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(default=ImageTensor(type='comfy.image_tensor'), description='The image to extract the color mask.')
    color: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The color to use for the mask.')
    @classmethod
    def get_node_type(cls): return "comfy.mask.ImageColorToMask"


from nodetool.nodes.comfy.mask import ChannelEnum

class ImageToMask(GraphNode):
    image: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(default=ImageTensor(type='comfy.image_tensor'), description='The image to extract the mask.')
    channel: ChannelEnum | GraphNode | tuple[GraphNode, str] = Field(default=ChannelEnum('red'), description='The channel to use for the mask.')
    @classmethod
    def get_node_type(cls): return "comfy.mask.ImageToMask"



class InvertMask(GraphNode):
    mask: Mask | GraphNode | tuple[GraphNode, str] = Field(default=Mask(type='comfy.mask'), description='The mask to invert.')
    @classmethod
    def get_node_type(cls): return "comfy.mask.InvertMask"


from nodetool.nodes.comfy.mask import OperationEnum

class MaskComposite(GraphNode):
    destination: Mask | GraphNode | tuple[GraphNode, str] = Field(default=Mask(type='comfy.mask'), description='The destination mask.')
    source: Mask | GraphNode | tuple[GraphNode, str] = Field(default=Mask(type='comfy.mask'), description='The source mask.')
    x: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The x position.')
    y: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The y position.')
    operation: OperationEnum | GraphNode | tuple[GraphNode, str] = Field(default=OperationEnum('multiply'), description='The operation to use.')
    @classmethod
    def get_node_type(cls): return "comfy.mask.MaskComposite"



class MaskToImage(GraphNode):
    mask: Mask | GraphNode | tuple[GraphNode, str] = Field(default=Mask(type='comfy.mask'), description='The mask to convert.')
    @classmethod
    def get_node_type(cls): return "comfy.mask.MaskToImage"



class SolidMask(GraphNode):
    value: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The value for the solid mask.')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='Width of the solid mask.')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='Height of the solid mask.')
    @classmethod
    def get_node_type(cls): return "comfy.mask.SolidMask"


