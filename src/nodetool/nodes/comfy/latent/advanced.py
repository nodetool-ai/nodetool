from pydantic import Field
from nodetool.metadata.types import Latent
from nodetool.common.comfy_node import ComfyNode


class LatentAdd(ComfyNode):
    samples1: Latent = Field(
        default=Latent(), description="The first set of latent samples to add."
    )
    samples2: Latent = Field(
        default=Latent(), description="The second set of latent samples to add."
    )

    @classmethod
    def return_type(cls):
        return {"latent": Latent}


class LatentSubtract(ComfyNode):
    samples1: Latent = Field(
        default=Latent(),
        description="The first set of latent samples to subtract from.",
    )
    samples2: Latent = Field(
        default=Latent(), description="The second set of latent samples to subtract."
    )

    @classmethod
    def return_type(cls):
        return {"latent": Latent}


class LatentMultiply(ComfyNode):
    samples: Latent = Field(
        default=Latent(), description="The latent samples to multiply."
    )
    multiplier: float = Field(
        default=1.0, description="The multiplier for the latent samples."
    )

    @classmethod
    def return_type(cls):
        return {"latent": Latent}


class LatentInterpolate(ComfyNode):
    samples1: Latent = Field(
        default=Latent(),
        description="The first set of latent samples for interpolation.",
    )
    samples2: Latent = Field(
        default=Latent(),
        description="The second set of latent samples for interpolation.",
    )
    ratio: float = Field(
        default=1.0,
        description="The ratio for interpolation, controlling the blend between samples1 and samples2.",
    )

    @classmethod
    def return_type(cls):
        return {"latent": Latent}
