from enum import Enum

from pydantic import Field
from nodetool.metadata.types import ImageTensor, Mask

from nodetool.common.comfy_node import ComfyNode


class PorterDuffModeEnum(str, Enum):
    ADD = "ADD"
    CLEAR = "CLEAR"
    DARKEN = "DARKEN"
    DST = "DST"
    DST_ATOP = "DST_ATOP"
    DST_IN = "DST_IN"
    DST_OUT = "DST_OUT"
    DST_OVER = "DST_OVER"
    LIGHTEN = "LIGHTEN"
    MULTIPLY = "MULTIPLY"
    OVERLAY = "OVERLAY"
    SCREEN = "SCREEN"
    SRC = "SRC"
    SRC_ATOP = "SRC_ATOP"
    SRC_IN = "SRC_IN"
    SRC_OUT = "SRC_OUT"
    SRC_OVER = "SRC_OVER"
    XOR = "XOR"


class PorterDuffImageComposite(ComfyNode):
    source: ImageTensor = Field(default=ImageTensor(), description="The source image.")
    source_alpha: Mask = Field(default=Mask(), description="The source alpha (mask).")
    destination: ImageTensor = Field(
        default=ImageTensor(), description="The destination image."
    )
    destination_alpha: Mask = Field(
        default=Mask(), description="The destination alpha (mask)."
    )
    mode: PorterDuffModeEnum = Field(
        default=PorterDuffModeEnum.DST,
        description="The Porter-Duff compositing mode to use.",
    )

    @classmethod
    def return_types(cls):
        return {"image": ImageTensor, "mask": Mask}


class SplitImageWithAlpha(ComfyNode):
    image: ImageTensor = Field(
        default=ImageTensor(), description="The image with an alpha channel to split."
    )

    @classmethod
    def return_types(cls):
        return {"image": ImageTensor, "mask": Mask}


class JoinImageWithAlpha(ComfyNode):
    image: ImageTensor = Field(
        default=ImageTensor(), description="The image to join with an alpha channel."
    )
    alpha: Mask = Field(
        default=Mask(), description="The alpha channel (mask) to join with the image."
    )

    @classmethod
    def return_type(cls):
        return {"image": ImageTensor}
