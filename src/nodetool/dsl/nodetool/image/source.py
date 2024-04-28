from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class Background(GraphNode):
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description=None)
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description=None)
    color: str | GraphNode | tuple[GraphNode, str] = Field(default='#FFFFFF', description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.image.source.Background"



class GaussianNoise(GraphNode):
    mean: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)
    stddev: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description=None)
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description=None)
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.image.source.GaussianNoise"


from nodetool.nodes.nodetool.image.source import TextFont
from nodetool.nodes.nodetool.image.source import TextAlignment

class RenderText(GraphNode):
    text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The text to render.')
    font: TextFont | GraphNode | tuple[GraphNode, str] = Field(default=TextFont('DejaVuSans.ttf'), description='The font to use.')
    x: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The x coordinate.')
    y: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The y coordinate.')
    size: int | GraphNode | tuple[GraphNode, str] = Field(default=12, description='The font size.')
    color: str | GraphNode | tuple[GraphNode, str] = Field(default='#000000', description='The font color.')
    align: TextAlignment | GraphNode | tuple[GraphNode, str] = Field(default=TextAlignment('left'), description=None)
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None), description='The image to render on.')
    @classmethod
    def get_node_type(cls): return "nodetool.image.source.RenderText"


