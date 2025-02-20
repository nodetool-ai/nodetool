from enum import Enum
from typing import Any
from pydantic import Field
from nodetool.metadata.types import ImageRef, ImageRef
from nodetool.nodes.comfy.comfy_node import ComfyNode
from nodetool.workflows.processing_context import ProcessingContext
import comfy_extras.nodes_images


class SaveAnimatedWEBP(ComfyNode):
    """
    Save a list of images as an animated WEBP.
    """

    _comfy_class = comfy_extras.nodes_images.SaveAnimatedWEBP
    images: list[ImageRef] = Field(
        default=[], description="list of images to save as animated WEBP."
    )
    filename_prefix: str = Field(
        default="ComfyUI", description="Prefix for the filename."
    )
    fps: float = Field(default=6.0, description="Frames per second.")
    lossless: bool = Field(
        default=True, description="Whether to use lossless compression."
    )
    quality: int = Field(default=80, description="Quality of the WEBP.")
    method: Enum = Field(
        default="default", description="Compression method to use."
    )  # Enum should be adjusted to have the correct values from the "methods" list.

    @classmethod
    def return_type(cls):
        return None


class SaveAnimatedPNG(ComfyNode):
    """
    Save a list of images as an animated PNG.
    """

    _comfy_class = comfy_extras.nodes_images.SaveAnimatedPNG

    images: list[ImageRef] = Field(
        default=[], description="list of images to save as animated PNG."
    )
    filename_prefix: str = Field(
        default="ComfyUI", description="Prefix for the filename."
    )
    fps: float = Field(default=6.0, description="Frames per second.")
    compress_level: int = Field(default=4, description="PNG compression level.")

    hidden_fields: dict[str, Any] = Field(
        default={},
        description="Hidden fields like prompt and extra PNG information.",
    )

    @classmethod
    def return_type(cls):
        return None
