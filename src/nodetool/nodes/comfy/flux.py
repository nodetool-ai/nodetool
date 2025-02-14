import os
from pydantic import Field
from nodes import load_custom_node
from nodetool.nodes.comfy.comfy_node import ComfyNode
from nodetool.metadata.types import CLIP, Conditioning

import comfy_extras.nodes_flux


class CLIPTextEncodeFlux(ComfyNode):
    """
    The CLIP Text Encode Flux node can be used to encode a text prompt using a CLIP model into an embedding that can be used to guide the diffusion model towards generating specific images.
    """

    _comfy_class = comfy_extras.nodes_flux.CLIPTextEncodeFlux

    clip: CLIP = Field(
        default=CLIP(),
        description="The CLIP model to use for encoding.",
    )
    clip_l: str = Field(
        default="",
        description="The text to encode.",
    )
    t5xxl: str = Field(
        default="",
        description="The text to encode.",
    )
    guidance: float = Field(
        default=3.5,
        description="The guidance value to use for encoding.",
    )

    @classmethod
    def get_title(cls):
        return "CLIP Text Encode Flux"

    @classmethod
    def return_type(cls):
        return {"conditioning": Conditioning}


class FluxGuidance(ComfyNode):
    """
    The Flux Guidance node can be used to append guidance to a conditioning.
    """

    _comfy_class = comfy_extras.nodes_flux.FluxGuidance

    conditioning: Conditioning = Field(
        default=Conditioning(),
        description="The conditioning to append guidance to.",
    )
    guidance: float = Field(
        default=3.5,
        description="The guidance value to append.",
    )

    @classmethod
    def get_title(cls):
        return "Flux Guidance"

    @classmethod
    def return_type(cls):
        return {"conditioning": Conditioning}
