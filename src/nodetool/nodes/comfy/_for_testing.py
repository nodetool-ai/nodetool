from typing import Literal

from pydantic import Field
from nodetool.metadata.types import UNet
from nodetool.common.comfy_node import ComfyNode


class HyperTile(ComfyNode):
    model: UNet = Field(
        default=UNet(), description="The model to use for generating hyper-tiles."
    )
    tile_size: int = Field(default=256, description="The size of the tile to generate.")
    swap_size: int = Field(
        default=2, description="The swap size used during generation."
    )
    max_depth: int = Field(default=0, description="The maximum depth for tiling.")
    scale_depth: bool = Field(
        default=False, description="Whether to scale the depth progressively."
    )

    @classmethod
    def return_type(cls):
        return {"unet": UNet}
