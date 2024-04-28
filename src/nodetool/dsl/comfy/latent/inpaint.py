from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class SetLatentNoiseMask(GraphNode):
    samples: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent'), description='The latent samples to set the noise mask for.')
    mask: Mask | GraphNode | tuple[GraphNode, str] = Field(default=Mask(type='comfy.mask'), description='The mask to use for the noise.')
    @classmethod
    def get_node_type(cls): return "comfy.latent.inpaint.SetLatentNoiseMask"


