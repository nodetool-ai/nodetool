from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class RepeatImageBatch(GraphNode):
    """
    Repeat an image a given number of times.
    """

    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to repeat.')
    amount: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='The number of times to repeat the image.')

    @classmethod
    def get_node_type(cls): return "comfy.image.batch.RepeatImageBatch"


