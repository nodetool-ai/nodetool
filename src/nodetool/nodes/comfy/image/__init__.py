from enum import Enum
import random
from typing import Any
import numpy as np
from pydantic import Field
from nodetool.metadata.types import ImageRef, Mask
from nodetool.common.comfy_node import ComfyNode


class ImageCompositeMasked(ComfyNode):
    destination: ImageRef = Field(
        default=ImageRef(), description="The destination image."
    )
    source: ImageRef = Field(default=ImageRef(), description="The source image.")
    x: int = Field(default=0, description="The x position.")
    y: int = Field(default=0, description="The y position.")
    resize_source: bool = Field(
        default=False, description="Whether to resize the source."
    )
    mask: Mask = Field(None, description="The mask to use.")

    @classmethod
    def return_type(cls):
        return {"image": ImageRef}


class ColorChannel(str, Enum):
    ALPHA = "alpha"
    RED = "red"
    GREEN = "green"
    BLUE = "blue"


class LoadImageMask(ComfyNode):
    image: ImageRef = Field(default=ImageRef(), description="The image to load.")
    channel: ColorChannel = Field(
        default=ColorChannel.ALPHA, description="The color channel to use."
    )

    @classmethod
    def return_type(cls):
        return {"mask": Mask}


class ImagePadForOutpaint(ComfyNode):
    """
    The Pad Image for Outpainting node can be used to to add padding to an image for outpainting. This image can then be given to an inpaint diffusion model via the VAE Encode for Inpainting.
    """

    image: ImageRef = Field(default=ImageRef(), description="The image to pad.")
    left: int = Field(default=0, description="The padding size on the left side.")
    top: int = Field(default=0, description="The padding size on the top side.")
    right: int = Field(default=0, description="The padding size on the right side.")
    bottom: int = Field(default=0, description="The padding size on the bottom side.")
    feathering: int = Field(
        default=40,
        description="The feathering value for softening the edges of the padding.",
    )

    @classmethod
    def get_title(cls):
        return "Pad Image for Outpainting"

    @classmethod
    def return_type(cls):
        return {"image": ImageRef, "mask": Mask}
