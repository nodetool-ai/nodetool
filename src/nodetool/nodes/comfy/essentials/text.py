from nodetool.common.comfy_node import ComfyNode
from nodetool.metadata.types import ImageRef, Mask
from pydantic import Field
from enum import Enum
from typing import Optional


class HorizontalAlign(str, Enum):
    LEFT = "left"
    CENTER = "center"
    RIGHT = "right"


class VerticalAlign(str, Enum):
    TOP = "top"
    CENTER = "center"
    BOTTOM = "bottom"


class Direction(str, Enum):
    LTR = "ltr"
    RTL = "rtl"


class DrawText(ComfyNode):
    """
    Draw text on an image or create a new image with text.
    text, image, drawing

    Use cases:
    - Add captions or labels to images
    - Create text-based images for graphics or designs
    - Overlay text on existing images with customizable styles
    """

    _comfy_class = "DrawText+"

    text: str = Field(default="Hello, World!", description="The text to draw")
    font: str = Field(default="", description="Font file name")
    size: int = Field(default=56, ge=1, le=9999, description="Font size")
    color: str = Field(default="#FFFFFF", description="Text color in hex format")
    background_color: str = Field(
        default="#00000000", description="Background color in hex format"
    )
    shadow_distance: int = Field(default=0, ge=0, le=100, description="Shadow distance")
    shadow_blur: int = Field(default=0, ge=0, le=100, description="Shadow blur amount")
    shadow_color: str = Field(
        default="#000000", description="Shadow color in hex format"
    )
    horizontal_align: HorizontalAlign = Field(
        default=HorizontalAlign.LEFT, description="Horizontal alignment"
    )
    vertical_align: VerticalAlign = Field(
        default=VerticalAlign.TOP, description="Vertical alignment"
    )
    offset_x: int = Field(
        default=0, ge=-10000, le=10000, description="Horizontal offset"
    )
    offset_y: int = Field(default=0, ge=-10000, le=10000, description="Vertical offset")
    direction: Direction = Field(default=Direction.LTR, description="Text direction")
    img_composite: Optional[ImageRef] = Field(
        default=None, description="Optional background image"
    )

    @classmethod
    def return_type(cls):
        return {"image": ImageRef, "mask": Mask}
