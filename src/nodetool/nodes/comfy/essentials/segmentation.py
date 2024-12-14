from nodetool.common.comfy_node import ComfyNode
from nodetool.metadata.types import ImageRef, Mask
from pydantic import Field
from typing import Tuple, Any


class LoadCLIPSegModels(ComfyNode):
    """
    Load CLIP segmentation models.
    segmentation, CLIP, model loading

    Use cases:
    - Prepare CLIP segmentation models for image analysis
    - Load pre-trained models for semantic segmentation
    - Initialize segmentation pipeline
    """

    _comfy_class = "LoadCLIPSegModels+"

    @classmethod
    def return_type(cls):
        return {"clip_seg": Tuple[Any, Any]}


class ApplyCLIPSeg(ComfyNode):
    """
    Apply CLIP segmentation to an image.
    segmentation, CLIP, image analysis

    Use cases:
    - Perform semantic segmentation on images
    - Extract specific objects or regions from images
    - Create masks based on text prompts
    """

    _comfy_class = "ApplyCLIPSeg+"

    clip_seg: Tuple[Any, Any] = Field(
        default=(None, None), description="The CLIP segmentation models"
    )
    image: ImageRef = Field(
        default=ImageRef(), description="The input image to segment"
    )
    prompt: str = Field(default="", description="Text prompt for segmentation")
    threshold: float = Field(default=0.4, description="Segmentation threshold")
    smooth: int = Field(default=9, description="Smoothing factor")
    dilate: int = Field(default=0, description="Dilation factor")
    blur: int = Field(default=0, description="Blur factor")

    @classmethod
    def return_type(cls):
        return {"mask": Mask}
