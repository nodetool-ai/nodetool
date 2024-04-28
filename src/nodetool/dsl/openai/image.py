from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

from nodetool.nodes.openai.image import Size
from nodetool.nodes.openai.image import Quality
from nodetool.nodes.openai.image import Style

class CreateImage(GraphNode):
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to use.')
    size: Size | GraphNode | tuple[GraphNode, str] = Field(default=Size('1024x1024'), description='The size of the image to generate.')
    quality: Quality | GraphNode | tuple[GraphNode, str] = Field(default=Quality('standard'), description='The quality of the image to generate.')
    style: Style | GraphNode | tuple[GraphNode, str] = Field(default=Style('natural'), description='The style to use.')
    @classmethod
    def get_node_type(cls): return "openai.image.CreateImage"


