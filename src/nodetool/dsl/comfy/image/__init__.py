from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class ImageCompositeMasked(GraphNode):
    """
    The Image Composite Masked node can be used to composite an image onto another image using a mask.
    """

    destination: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The destination image.')
    source: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The source image.')
    x: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The x position.')
    y: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The y position.')
    resize_source: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Whether to resize the source.')
    mask: Mask | GraphNode | tuple[GraphNode, str] = Field(default=None, description='The mask to use.')

    @classmethod
    def get_node_type(cls): return "comfy.image.ImageCompositeMasked"



class ImagePadForOutpaint(GraphNode):
    """
    The Pad Image for Outpainting node can be used to to add padding to an image for outpainting. This image can then be given to an inpaint diffusion model via the VAE Encode for Inpainting.
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to pad.')
    left: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The padding size on the left side.')
    top: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The padding size on the top side.')
    right: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The padding size on the right side.')
    bottom: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The padding size on the bottom side.')
    feathering: int | GraphNode | tuple[GraphNode, str] = Field(default=40, description='The feathering value for softening the edges of the padding.')

    @classmethod
    def get_node_type(cls): return "comfy.image.ImagePadForOutpaint"



class LoadImage(GraphNode):
    """
    The Load Image node can be used to to load an image. Images can be uploaded in the asset manager or by dropping an image onto the node. Once the image has been uploaded they can be selected inside the node.
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to load.')

    @classmethod
    def get_node_type(cls): return "comfy.image.LoadImage"


import nodetool.nodes.comfy.image

class LoadImageMask(GraphNode):
    """
    Load an Image and extract a mask from it.
    """

    ColorChannel: typing.ClassVar[type] = nodetool.nodes.comfy.image.LoadImageMask.ColorChannel
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to load.')
    channel: nodetool.nodes.comfy.image.LoadImageMask.ColorChannel = Field(default=ColorChannel.ALPHA, description='The color channel to use.')

    @classmethod
    def get_node_type(cls): return "comfy.image.LoadImageMask"



class SaveImage(GraphNode):
    """
    The Save Image node can be used to save images. To simply preview an image inside the node graph use the Preview Image node. It can be hard to keep track of all the images that you generate. To help with organizing your images you can pass specially formatted strings to an output node with a file_prefix widget.
    """

    images: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to save.')
    filename_prefix: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prefix for the filename where the image will be saved.')

    @classmethod
    def get_node_type(cls): return "comfy.image.SaveImage"


