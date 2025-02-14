from pydantic import Field
from nodetool.nodes.comfy.comfy_node import ComfyNode
from nodetool.metadata.types import Noise, UNet

import comfy_extras.nodes_custom_sampler


class RandomNoise(ComfyNode):
    """
    Generate random noise.
    """

    _comfy_class = comfy_extras.nodes_custom_sampler.RandomNoise

    noise_seed: int = Field(default=0, description="The seed for the noise generation.")

    @classmethod
    def return_type(cls):
        return {"noise": Noise}


class DisableNoise(ComfyNode):
    """
    Disable noise generation.
    """

    _comfy_class = comfy_extras.nodes_custom_sampler.DisableNoise


class AddNoise(ComfyNode):
    """
    Add noise to an image.
    """

    _comfy_class = comfy_extras.nodes_custom_sampler.AddNoise

    model: UNet = Field(default=UNet(), description="The model used by the sampler.")
    noise: Noise = Field(default=Noise(), description="The noise to add.")
    sigmas: float = Field(default=8.0, description="The sigmas used in sampling.")
    latent_image: str = Field(
        default="", description="The latent image to sample from."
    )
