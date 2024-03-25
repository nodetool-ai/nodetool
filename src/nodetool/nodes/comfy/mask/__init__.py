from enum import Enum
from pydantic import Field
from nodetool.metadata.types import ImageTensor, Mask
from nodetool.nodes.comfy import ComfyNode
from nodetool.nodes.comfy.image import ColorChannel


class ChannelEnum(str, Enum):
    RED = "red"
    GREEN = "green"
    BLUE = "blue"
    ALPHA = "alpha"


class OperationEnum(str, Enum):
    MULTIPLY = "multiply"
    ADD = "add"
    SUBTRACT = "subtract"
    AND = "and"
    OR = "or"
    XOR = "xor"


class MaskToImage(ComfyNode):
    mask: Mask = Field(default=Mask(), description="The mask to convert.")

    @classmethod
    def return_type(cls):
        return {"image": ImageTensor}


class ImageToMask(ComfyNode):
    image: ImageTensor = Field(
        default=ImageTensor(), description="The image to extract the mask."
    )
    channel: ChannelEnum = Field(
        default=ChannelEnum.RED, description="The channel to use for the mask."
    )

    @classmethod
    def return_type(cls):
        return {"mask": Mask}


class ImageColorToMask(ComfyNode):
    image: ImageTensor = Field(
        default=ImageTensor(), description="The image to extract the color mask."
    )
    color: int = Field(default=0, description="The color to use for the mask.")

    @classmethod
    def return_type(cls):
        return {"mask": Mask}


class SolidMask(ComfyNode):
    value: float = Field(default=1.0, description="The value for the solid mask.")
    width: int = Field(default=512, description="Width of the solid mask.")
    height: int = Field(default=512, description="Height of the solid mask.")

    @classmethod
    def return_type(cls):
        return {"mask": Mask}


class InvertMask(ComfyNode):
    mask: Mask = Field(default=Mask(), description="The mask to invert.")

    @classmethod
    def return_type(cls):
        return {"mask": Mask}


class CropMask(ComfyNode):
    mask: Mask = Field(default=Mask(), description="The mask to crop.")
    x: int = Field(default=0, description="The x position for cropping.")
    y: int = Field(default=0, description="The y position for cropping.")
    width: int = Field(default=512, description="Width of the crop.")
    height: int = Field(default=512, description="Height of the crop.")

    @classmethod
    def return_type(cls):
        return {"mask": Mask}


class MaskComposite(ComfyNode):
    destination: Mask = Field(default=Mask(), description="The destination mask.")
    source: Mask = Field(default=Mask(), description="The source mask.")
    x: int = Field(default=0, description="The x position.")
    y: int = Field(default=0, description="The y position.")
    operation: OperationEnum = Field(
        default=OperationEnum.MULTIPLY, description="The operation to use."
    )

    @classmethod
    def return_type(cls):
        return {"mask": Mask}


class FeatherMask(ComfyNode):
    mask: Mask = Field(default=Mask(), description="The mask to feather.")
    left: int = Field(default=0, description="Feather amount on the left.")
    top: int = Field(default=0, description="Feather amount on the top.")
    right: int = Field(default=0, description="Feather amount on the right.")
    bottom: int = Field(default=0, description="Feather amount on the bottom.")

    @classmethod
    def return_type(cls):
        return {"mask": Mask}


class GrowMask(ComfyNode):
    mask: Mask = Field(default=Mask(), description="The mask to grow.")
    expand: int = Field(default=0, description="The amount to expand the mask.")
    tapered_corners: bool = Field(
        default=True, description="Whether to taper the corners."
    )

    @classmethod
    def return_type(cls):
        return {"mask": Mask}
