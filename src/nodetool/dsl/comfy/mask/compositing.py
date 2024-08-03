from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class JoinImageWithAlpha(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to join with an alpha channel.')
    alpha: Mask | GraphNode | tuple[GraphNode, str] = Field(default=Mask(type='comfy.mask', data=None), description='The alpha channel (mask) to join with the image.')
    @classmethod
    def get_node_type(cls): return "comfy.mask.compositing.JoinImageWithAlpha"


from nodetool.nodes.comfy.mask.compositing import PorterDuffModeEnum

class PorterDuffImageComposite(GraphNode):
    source: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The source image.')
    source_alpha: Mask | GraphNode | tuple[GraphNode, str] = Field(default=Mask(type='comfy.mask', data=None), description='The source alpha (mask).')
    destination: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The destination image.')
    destination_alpha: Mask | GraphNode | tuple[GraphNode, str] = Field(default=Mask(type='comfy.mask', data=None), description='The destination alpha (mask).')
    mode: PorterDuffModeEnum | GraphNode | tuple[GraphNode, str] = Field(default=PorterDuffModeEnum('DST'), description='The Porter-Duff compositing mode to use.')
    @classmethod
    def get_node_type(cls): return "comfy.mask.compositing.PorterDuffImageComposite"



class SplitImageWithAlpha(GraphNode):
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image with an alpha channel to split.')
    @classmethod
    def get_node_type(cls): return "comfy.mask.compositing.SplitImageWithAlpha"


