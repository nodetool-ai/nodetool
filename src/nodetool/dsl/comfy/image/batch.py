from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class RepeatImageBatch(GraphNode):
    image: ImageTensor | GraphNode | tuple[GraphNode, str] = Field(default=ImageTensor(type='comfy.image_tensor'), description='The image to repeat.')
    amount: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='The number of times to repeat the image.')
    @classmethod
    def get_node_type(cls): return "comfy.image.batch.RepeatImageBatch"


