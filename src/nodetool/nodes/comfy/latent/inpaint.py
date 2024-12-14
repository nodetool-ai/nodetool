from pydantic import Field
from nodetool.metadata.types import Latent, Mask
from nodetool.common.comfy_node import ComfyNode


class SetLatentNoiseMask(ComfyNode):
    """
    The Set Latent Noise Mask node can be used to add a mask to the latent images for inpainting. When the noise mask is set a sampler node will only operate on the masked area. If a single mask is provided, all the latents in the batch will use this mask.
    """

    samples: Latent = Field(
        default=Latent(), description="The latent samples to set the noise mask for."
    )
    mask: Mask = Field(default=Mask(), description="The mask to use for the noise.")

    @classmethod
    def return_type(cls):
        return {"latent": Latent}
