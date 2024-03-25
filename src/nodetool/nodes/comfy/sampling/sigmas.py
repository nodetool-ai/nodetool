from pydantic import Field
from nodetool.metadata.types import Sigmas
from nodetool.nodes.comfy import ComfyNode


class SplitSigmas(ComfyNode):
    sigmas: Sigmas = Field(
        default=Sigmas(), description="The array of sigmas to split."
    )
    step: int = Field(
        default=0, description="The specific step at which to split the sigmas array."
    )

    @classmethod
    def return_types(cls):
        return {"sigmas": Sigmas}, Sigmas


class FlipSigmas(ComfyNode):
    sigmas: Sigmas = Field(default=Sigmas(), description="The array of sigmas to flip.")

    @classmethod
    def return_type(cls):
        return {"sigmas": Sigmas}
