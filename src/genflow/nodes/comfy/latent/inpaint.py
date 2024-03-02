from pydantic import Field
from genflow.metadata.types import Latent, Mask
from genflow.nodes.comfy import ComfyNode


class SetLatentNoiseMask(ComfyNode):
    samples: Latent = Field(
        default=Latent(), description="The latent samples to set the noise mask for."
    )
    mask: Mask = Field(default=Mask(), description="The mask to use for the noise.")

    @classmethod
    def return_type(cls):
        return {"latent": Latent}
