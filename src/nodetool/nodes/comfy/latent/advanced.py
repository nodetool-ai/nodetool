from pydantic import Field
from nodetool.metadata.types import Latent
from nodetool.common.comfy_node import ComfyNode


class LatentAdd(ComfyNode):
    """
    The Latent Add node can be used to add two sets of latent samples together. This operation allows for combining different latent representations, potentially creating interesting hybrid results.
    """

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
    """
    The Latent Subtract node can be used to subtract one set of latent samples from another. This operation can be useful for removing certain features or characteristics represented in the latent space.
    """

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
    """
    The Latent Multiply node can be used to scale the values of latent samples by a specified multiplier. This operation can amplify or diminish certain features in the latent representation.
    """

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
    """
    The Latent Interpolate node can be used to create a smooth transition between two sets of latent samples. This allows for blending different latent representations, potentially creating intermediate results.
    """

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
