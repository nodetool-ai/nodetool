from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class AddNoise(GraphNode):
    """
    Add noise to an image.
    """

    model: UNet | GraphNode | tuple[GraphNode, str] = Field(default=UNet(type='comfy.unet', name='', model=None), description='The model used by the sampler.')
    noise: Noise | GraphNode | tuple[GraphNode, str] = Field(default=Noise(type='comfy.noise', data=None), description='The noise to add.')
    sigmas: float | GraphNode | tuple[GraphNode, str] = Field(default=8.0, description='The sigmas used in sampling.')
    latent_image: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The latent image to sample from.')

    @classmethod
    def get_node_type(cls): return "comfy.sampling.noise.AddNoise"



class DisableNoise(GraphNode):
    """
    Disable noise generation.
    """


    @classmethod
    def get_node_type(cls): return "comfy.sampling.noise.DisableNoise"



class RandomNoise(GraphNode):
    """
    Generate random noise.
    """

    noise_seed: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The seed for the noise generation.')

    @classmethod
    def get_node_type(cls): return "comfy.sampling.noise.RandomNoise"


