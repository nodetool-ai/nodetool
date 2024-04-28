from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class ImageCrop(GraphNode):
    image: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(default=ImageTensor(type='comfy.image_tensor'), description='The image to crop.')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='Width of the crop.')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description='Height of the crop.')
    x: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='X position where the crop starts.')
    y: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Y position where the crop starts.')
    @classmethod
    def get_node_type(cls): return "comfy.image.transform.ImageCrop"


