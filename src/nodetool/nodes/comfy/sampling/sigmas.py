from pydantic import Field
from nodetool.metadata.types import Sigmas
from nodetool.common.comfy_node import ComfyNode

import comfy_extras.nodes_custom_sampler


class SplitSigmas(ComfyNode):
    """
    Split an array of sigmas into two arrays.
    """

    _comfy_class = comfy_extras.nodes_custom_sampler.SplitSigmas

    sigmas: Sigmas = Field(
        default=Sigmas(), description="The array of sigmas to split."
    )
    step: int = Field(
        default=0, description="The specific step at which to split the sigmas array."
    )

    @classmethod
    def return_type(cls):
        return {"sigmas": Sigmas}


class FlipSigmas(ComfyNode):
    """
    Flip an array of sigmas.
    """

    _comfy_class = comfy_extras.nodes_custom_sampler.FlipSigmas

    sigmas: Sigmas = Field(default=Sigmas(), description="The array of sigmas to flip.")

    @classmethod
    def return_type(cls):
        return {"sigmas": Sigmas}
