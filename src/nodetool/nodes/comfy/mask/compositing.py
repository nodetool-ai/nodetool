from enum import Enum
from pydantic import Field
from nodetool.metadata.types import ImageRef, Mask
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
    """
    The Porter-Duff Image Composite node can be used to combine two images using various compositing modes. This allows for complex image blending operations, useful for creating layered effects or combining multiple image elements.
    """

    source: ImageRef = Field(default=ImageRef(), description="The source image.")
    source_alpha: Mask = Field(default=Mask(), description="The source alpha (mask).")
    destination: ImageRef = Field(
        default=ImageRef(), description="The destination image."
    )
    destination_alpha: Mask = Field(
        default=Mask(), description="The destination alpha (mask)."
    )
    mode: PorterDuffModeEnum = Field(
        default=PorterDuffModeEnum.DST,
        description="The Porter-Duff compositing mode to use.",
    )

    @classmethod
    def return_type(cls):
        return {"image": ImageRef, "mask": Mask}


class SplitImageWithAlpha(ComfyNode):
    """
    The Split Image with Alpha node can be used to separate an image with an alpha channel into its color components and alpha mask. This is useful when you need to manipulate the image and its transparency separately.
    """

    image: ImageRef = Field(
        default=ImageRef(), description="The image with an alpha channel to split."
    )

    @classmethod
    def return_type(cls):
        return {"image": ImageRef, "mask": Mask}


class JoinImageWithAlpha(ComfyNode):
    """
    The Join Image with Alpha node can be used to combine an image and an alpha mask into a single image with transparency. This is useful for creating images with varying levels of opacity or for preparing images for compositing operations.
    """

    image: ImageRef = Field(
        default=ImageRef(), description="The image to join with an alpha channel."
    )
    alpha: Mask = Field(
        default=Mask(), description="The alpha channel (mask) to join with the image."
    )

    @classmethod
    def return_type(cls):
        return {"image": ImageRef}
