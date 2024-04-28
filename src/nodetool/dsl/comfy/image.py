from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class ImageBatch(GraphNode):
    image1: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(default=ImageTensor(type='comfy.image_tensor'), description='The image to batch.')
    image2: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(default=ImageTensor(type='comfy.image_tensor'), description='The image to batch.')
    @classmethod
    def get_node_type(cls): return "comfy.image.ImageBatch"



class ImageCompositeMasked(GraphNode):
    destination: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(default=ImageTensor(type='comfy.image_tensor'), description='The destination image.')
    source: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(default=ImageTensor(type='comfy.image_tensor'), description='The source image.')
    x: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The x position.')
    y: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The y position.')
    resize_source: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Whether to resize the source.')
    mask: Mask | GraphNode | tuple[GraphNode, str] = Field(default=None, description='The mask to use.')
    @classmethod
    def get_node_type(cls): return "comfy.image.ImageCompositeMasked"



class ImageInvert(GraphNode):
    image: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(default=ImageTensor(type='comfy.image_tensor'), description='The image to invert.')
    @classmethod
    def get_node_type(cls): return "comfy.image.ImageInvert"



class ImagePadForOutpaint(GraphNode):
    image: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(default=ImageTensor(type='comfy.image_tensor'), description='The image to pad.')
    left: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The padding size on the left side.')
    top: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The padding size on the top side.')
    right: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The padding size on the right side.')
    bottom: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The padding size on the bottom side.')
    feathering: int | GraphNode | tuple[GraphNode, str] = Field(default=40, description='The feathering value for softening the edges of the padding.')
    @classmethod
    def get_node_type(cls): return "comfy.image.ImagePadForOutpaint"



class LoadImage(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='The image to load.')
    upload: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='unused')
    @classmethod
    def get_node_type(cls): return "comfy.image.LoadImage"


from nodetool.nodes.comfy.image import ColorChannel

class LoadImageMask(GraphNode):
    image: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(default=ImageTensor(type='comfy.image_tensor'), description='The image to load.')
    channel: ColorChannel | GraphNode | tuple[GraphNode, str] = Field(default=ColorChannel('alpha'), description='The color channel to use.')
    @classmethod
    def get_node_type(cls): return "comfy.image.LoadImageMask"



class PreviewImage(GraphNode):
    images: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(default=ImageTensor(type='comfy.image_tensor'), description='The image to save.')
    filename_prefix: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prefix for the filename where the image will be saved.')
    @classmethod
    def get_node_type(cls): return "comfy.image.PreviewImage"



class SaveImage(GraphNode):
    images: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(default=ImageTensor(type='comfy.image_tensor'), description='The image to save.')
    filename_prefix: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prefix for the filename where the image will be saved.')
    @classmethod
    def get_node_type(cls): return "comfy.image.SaveImage"


