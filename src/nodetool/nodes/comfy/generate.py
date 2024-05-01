from pydantic import Field
from nodetool.common.comfy_node import ComfyNode


class EmptyImage(ComfyNode):
    width: int = Field(default=512, description="The width of the empty image.")
    height: int = Field(default=512, description="The height of the empty image.")
    batch_size: int = Field(
        default=1, description="The batch size for the empty images."
    )
    color: int = Field(
        default=0,
        description="The default color for the image, represented as an integer.",
    )
