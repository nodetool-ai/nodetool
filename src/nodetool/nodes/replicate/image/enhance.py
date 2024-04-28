from pydantic import BaseModel, Field
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode
from nodetool.common.replicate_node import ReplicateNode
from enum import Enum


class Model(str, Enum):
    IMAGE_DENOISING = "Image Denoising"
    IMAGE_DEBLURRING__GOPRO = "Image Deblurring (GoPro)"
    IMAGE_DEBLURRING__REDS = "Image Deblurring (REDS)"
    IMAGE_DEBLURRING__REALBLUR_R = "Image Deblurring (RealBlur_R)"
    IMAGE_DEBLURRING__REALBLUR_J = "Image Deblurring (RealBlur_J)"
    IMAGE_DERAINING__RAIN_STREAK = "Image Deraining (Rain streak)"
    IMAGE_DERAINING__RAIN_DROP = "Image Deraining (Rain drop)"
    IMAGE_DEHAZING__INDOOR = "Image Dehazing (Indoor)"
    IMAGE_DEHAZING__OUTDOOR = "Image Dehazing (Outdoor)"
    IMAGE_ENHANCEMENT__LOW_LIGHT = "Image Enhancement (Low-light)"
    IMAGE_ENHANCEMENT__RETOUCHING = "Image Enhancement (Retouching)"


class Maxim(ReplicateNode):
    """Multi-Axis MLP for Image Processing"""

    def replicate_model_id(self):
        return "google-research/maxim:494ca4d578293b4b93945115601b6a38190519da18467556ca223d219c3af9f9"

    def get_hardware(self):
        return "Nvidia T4 GPU"

    @classmethod
    def return_type(cls):
        return ImageRef

    image: ImageRef = Field(default=ImageRef(), description="Input image.")
    model: Model = Field(description="Choose a model.", default=None)


class OldPhotosRestoration(ReplicateNode):
    """Bringing Old Photos Back to Life"""

    def replicate_model_id(self):
        return "microsoft/bringing-old-photos-back-to-life:c75db81db6cbd809d93cc3b7e7a088a351a3349c9fa02b6d393e35e0d51ba799"

    def get_hardware(self):
        return "Nvidia T4 GPU"

    @classmethod
    def return_type(cls):
        return ImageRef

    HR: bool = Field(
        title="Hr",
        description="whether the input image is high-resolution",
        default=False,
    )
    image: ImageRef = Field(default=ImageRef(), description="input image.")
    with_scratch: bool = Field(
        title="With Scratch",
        description="whether the input image is scratched",
        default=False,
    )


class CodeFormer(ReplicateNode):
    """Robust face restoration algorithm for old photos/AI-generated faces - (A40 GPU)"""

    def replicate_model_id(self):
        return "lucataco/codeformer:78f2bab438ab0ffc85a68cdfd316a2ecd3994b5dd26aa6b3d203357b45e5eb1b"

    def get_hardware(self):
        return "Nvidia A40 (Large) GPU"

    @classmethod
    def return_type(cls):
        return ImageRef

    image: ImageRef = Field(default=ImageRef(), description="Input image")
    upscale: int = Field(
        title="Upscale",
        description="The final upsampling scale of the image",
        default=2,
    )
    face_upsample: bool = Field(
        title="Face Upsample",
        description="Upsample restored faces for high-resolution AI-created images",
        default=True,
    )
    background_enhance: bool = Field(
        title="Background Enhance",
        description="Enhance background image with Real-ESRGAN",
        default=True,
    )
    codeformer_fidelity: float = Field(
        title="Codeformer Fidelity",
        description="Balance the quality (lower number) and fidelity (higher number).",
        ge=0.0,
        le=1.0,
        default=0.5,
    )
