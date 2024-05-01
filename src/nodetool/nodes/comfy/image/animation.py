from enum import Enum
from typing import Any
from pydantic import Field
from nodetool.metadata.types import ImageTensor
from nodetool.common.comfy_node import ComfyNode


class SaveAnimatedWEBP(ComfyNode):
    images: list[ImageTensor] = Field(
        default_factory=list, description="list of images to save as animated WEBP."
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

    hidden_fields: dict[str, Any] = Field(
        default_factory=dict,
        description="Hidden fields like prompt and extra PNG information.",
    )
    output_node: bool = True

    @classmethod
    def return_type(cls):
        return None


class SaveAnimatedPNG(ComfyNode):
    images: list[ImageTensor] = Field(
        default_factory=list, description="list of images to save as animated PNG."
    )
    filename_prefix: str = Field(
        default="ComfyUI", description="Prefix for the filename."
    )
    fps: float = Field(default=6.0, description="Frames per second.")
    compress_level: int = Field(default=4, description="PNG compression level.")

    hidden_fields: dict[str, Any] = Field(
        default_factory=dict,
        description="Hidden fields like prompt and extra PNG information.",
    )
    output_node: bool = True

    @classmethod
    def return_type(cls):
        return None
