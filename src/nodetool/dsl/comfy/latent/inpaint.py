from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class SetLatentNoiseMask(GraphNode):
    """
    The Set Latent Noise Mask node can be used to add a mask to the latent images for inpainting. When the noise mask is set a sampler node will only operate on the masked area. If a single mask is provided, all the latents in the batch will use this mask.
    """

    samples: Latent | GraphNode | tuple[GraphNode, str] = Field(default=Latent(type='comfy.latent', data=None), description='The latent samples to set the noise mask for.')
    mask: Mask | GraphNode | tuple[GraphNode, str] = Field(default=Mask(type='comfy.mask', data=None), description='The mask to use for the noise.')

    @classmethod
    def get_node_type(cls): return "comfy.latent.inpaint.SetLatentNoiseMask"


