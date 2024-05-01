from enum import Enum
from pydantic import Field, validator
from nodetool.metadata.types import ImageTensor, UpscaleModel
from nodetool.common.comfy_node import ComfyNode


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
    image: ImageTensor = Field(default=ImageTensor(), description="The image to scale.")
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
        return {"image": ImageTensor}


class ImageScaleBy(ComfyNode):
    image: ImageTensor = Field(default=ImageTensor(), description="The image to scale.")
    upscale_method: UpscaleMethod = Field(
        default=UpscaleMethod.NEAREST_EXACT,
        description="The method to use for upscaling the image.",
    )
    scale_by: float = Field(
        default=1.0, description="The scaling factor by which to scale the image."
    )

    @classmethod
    def return_type(cls):
        return {"image": ImageTensor}


class ImageUpscaleWithModel(ComfyNode):
    upscale_model: UpscaleModel = Field(
        default="",
        description="The model to use for upscaling the image.",
    )
    image: ImageTensor = Field(
        default=ImageTensor(), description="The image to upscale."
    )

    @classmethod
    def return_type(cls):
        return {"image": ImageTensor}
