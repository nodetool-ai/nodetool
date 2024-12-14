from pydantic import Field
from nodetool.common.comfy_node import ComfyNode
from nodetool.metadata.types import Noise, UNet


class RandomNoise(ComfyNode):
    noise_seed: int = Field(default=0, description="The seed for the noise generation.")

    @classmethod
    def return_type(cls):
        return {"noise": Noise}


class DisableNoise(ComfyNode):
    pass


class AddNoise(ComfyNode):
    model: UNet = Field(default=UNet(), description="The model used by the sampler.")
    noise: Noise = Field(default=Noise(), description="The noise to add.")
    sigmas: float = Field(default=8.0, description="The sigmas used in sampling.")
    latent_image: str = Field(
        default="", description="The latent image to sample from."
    )
