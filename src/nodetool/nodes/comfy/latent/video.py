from pydantic import Field
from nodetool.common.comfy_node import ComfyNode, MAX_RESOLUTION
from nodetool.metadata.types import Latent
import comfy_extras.nodes_mochi


class EmptyMochiLatentVideo(ComfyNode):
    """
    The Empty Mochi Latent Video node creates a new set of empty latent
    images specifically formatted for video processing.
    """

    _comfy_class = comfy_extras.nodes_mochi.EmptyMochiLatentVideo

    width: int = Field(
        default=848,
        description="The width of the latent video to generate.",
        ge=16,
        le=MAX_RESOLUTION,
        multiple_of=16,
    )
    height: int = Field(
        default=480,
        description="The height of the latent video to generate.",
        ge=16,
        le=MAX_RESOLUTION,
        multiple_of=16,
    )
    length: int = Field(
        default=25,
        description="The number of frames in the video.",
        ge=7,
        le=MAX_RESOLUTION,
        multiple_of=6,
    )
    batch_size: int = Field(
        default=1,
        description="The batch size of the latent video to generate.",
        ge=1,
        le=4096,
    )

    @classmethod
    def return_type(cls):
        return {"latent": Latent}

    @classmethod
    def get_title(cls):
        return "Empty Mochi Latent Video"


class EmptyLTXVLatentVideo(ComfyNode):
    """
    Generates an empty latent video tensor.
    latent, video, ltxv

    Use cases:
    - Initialize a latent tensor for video generation
    - Prepare inputs for LTXV-based models
    """

    _comfy_class = comfy_extras.nodes_mochi.EmptyMochiLatentVideo

    width: int = Field(
        default=768, ge=64, le=MAX_RESOLUTION, description="Width of the latent video."
    )
    height: int = Field(
        default=512, ge=64, le=MAX_RESOLUTION, description="Height of the latent video."
    )
    length: int = Field(
        default=97,
        ge=1,
        le=MAX_RESOLUTION,
        description="Length (frames) of the latent video.",
    )
    batch_size: int = Field(default=1, ge=1, le=4096, description="Batch size.")

    @classmethod
    def get_title(cls):
        return "Empty LTXV Latent Video"

    @classmethod
    def return_type(cls):
        return {"latent": Latent}
