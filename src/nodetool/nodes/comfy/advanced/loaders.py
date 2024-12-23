from pydantic import Field
from nodetool.common.comfy_node import ComfyNode
from nodetool.metadata.types import (
    CLIP,
    Conditioning,
    ImageRef,
    VAE,
    ControlNet,
)
from enum import Enum

import comfy_extras.nodes_sd3


class TripleCLIPLoader(ComfyNode):
    """
    Loads three CLIP models.
    """

    _comfy_class = comfy_extras.nodes_sd3.TripleCLIPLoader

    clip_name1: str = Field(
        ..., description="The name of the first CLIP model to load."
    )
    clip_name2: str = Field(
        ..., description="The name of the second CLIP model to load."
    )
    clip_name3: str = Field(
        ..., description="The name of the third CLIP model to load."
    )

    @classmethod
    def get_title(cls):
        return "Triple CLIP Loader"

    @classmethod
    def return_type(cls):
        return {"clip": CLIP}


class EmptyPaddingEnum(str, Enum):
    NONE = "none"
    EMPTY_PROMPT = "empty_prompt"


class CLIPTextEncodeSD3(ComfyNode):
    """
    Encodes text using CLIP for the SD3 model.
    """

    _comfy_class = comfy_extras.nodes_sd3.CLIPTextEncodeSD3

    clip: CLIP = Field(
        default=CLIP(), description="The CLIP model to use for encoding."
    )
    clip_l: str = Field(default="", description="The local text to encode.")
    clip_g: str = Field(default="", description="The global text to encode.")
    t5xxl: str = Field(default="", description="The T5-XXL text to encode.")
    empty_padding: EmptyPaddingEnum = Field(
        default=EmptyPaddingEnum.NONE, description="The empty padding method."
    )

    @classmethod
    def get_title(cls):
        return "CLIP Text Encode SD3"

    @classmethod
    def return_type(cls):
        return {"conditioning": Conditioning}


class ControlNetApplySD3(ComfyNode):
    """
    Applies a ControlNet to the image.
    """

    _comfy_class = comfy_extras.nodes_sd3.ControlNetApplySD3

    positive: Conditioning = Field(
        default=Conditioning(), description="The positive conditioning."
    )
    negative: Conditioning = Field(
        default=Conditioning(), description="The negative conditioning."
    )
    control_net: ControlNet = Field(
        default=ControlNet(), description="The ControlNet to apply."
    )
    vae: VAE = Field(default=VAE(), description="The VAE to use.")
    image: ImageRef = Field(
        default=ImageRef(), description="The image to apply the ControlNet to."
    )
    strength: float = Field(
        default=1.0,
        description="The strength of the ControlNet application.",
        ge=0.0,
        le=10.0,
    )
    start_percent: float = Field(
        default=0.0,
        description="The start percentage for the ControlNet application.",
        ge=0.0,
        le=1.0,
    )
    end_percent: float = Field(
        default=1.0,
        description="The end percentage for the ControlNet application.",
        ge=0.0,
        le=1.0,
    )

    @classmethod
    def get_title(cls):
        return "ControlNet Apply SD3"

    @classmethod
    def return_type(cls):
        return {"positive": Conditioning, "negative": Conditioning}
