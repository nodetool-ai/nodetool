import os
from pydantic import Field
from nodes import load_custom_node
from nodetool.common.comfy_node import ComfyNode
from nodetool.metadata.types import CLIP, Conditioning

extras_dir = os.path.join(os.path.dirname(__file__), "..", "..", "..", "comfy_extras")

load_custom_node(
    os.path.join(extras_dir, "nodes_flux.py"), module_parent="comfy_extras"
)


class CLIPTextEncodeFlux(ComfyNode):
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
