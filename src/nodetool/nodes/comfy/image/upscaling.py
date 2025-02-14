from enum import Enum
from pydantic import Field, validator
from nodetool.metadata.types import ImageRef, UpscaleModel
from nodetool.nodes.comfy.comfy_node import ComfyNode

import nodes
import comfy_extras.nodes_upscale_model


class CropMethod(str, Enum):
    DISABLED = "disabled"
    CENTER = "center"


class UpscaleMethod(str, Enum):
    NEAREST_EXACT = "nearest_exact"
    BILINEAR = "bilinear"
    AREA = "area"
    BICUBIC = "bicubic"
    LANCZOS = "lanczos"


class ImageScale(ComfyNode):
    """
    Scale an image to a given size.
    """

    _comfy_class = nodes.ImageScale

    image: ImageRef = Field(default=ImageRef(), description="The image to scale.")
    upscale_method: UpscaleMethod = Field(
        default=UpscaleMethod.NEAREST_EXACT,
        description="The method to use for upscaling the image.",
    )
    width: int = Field(default=512, description="The target width for scaling.")
    height: int = Field(default=512, description="The target height for scaling.")
    crop: CropMethod = Field(
        default=CropMethod.DISABLED,
        description="The method to use if cropping is required.",
    )

    @classmethod
    def return_type(cls):
        return {"image": ImageRef}


class ImageScaleBy(ComfyNode):
    """
    Scale an image by a given factor.
    """

    _comfy_class = nodes.ImageScaleBy

    image: ImageRef = Field(default=ImageRef(), description="The image to scale.")
    upscale_method: UpscaleMethod = Field(
        default=UpscaleMethod.NEAREST_EXACT,
        description="The method to use for upscaling the image.",
    )
    scale_by: float = Field(
        default=1.0, description="The scaling factor by which to scale the image."
    )

    @classmethod
    def return_type(cls):
        return {"image": ImageRef}


class ImageUpscaleWithModel(ComfyNode):
    """
    Upscale an image using a given model.
    """

    _comfy_class = comfy_extras.nodes_upscale_model.ImageUpscaleWithModel

    upscale_model: UpscaleModel = Field(
        default="",
        description="The model to use for upscaling the image.",
    )
    image: ImageRef = Field(default=ImageRef(), description="The image to upscale.")

    @classmethod
    def return_type(cls):
        return {"image": ImageRef}
