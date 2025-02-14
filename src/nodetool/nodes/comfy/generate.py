from pydantic import Field
from nodetool.nodes.comfy.comfy_node import ComfyNode
import nodes


class EmptyImage(ComfyNode):
    """
    Generates an empty image.
    """

    _comfy_class = nodes.EmptyImage

    width: int = Field(default=512, description="The width of the empty image.")
    height: int = Field(default=512, description="The height of the empty image.")
    batch_size: int = Field(
        default=1, description="The batch size for the empty images."
    )
    color: int = Field(
        default=0,
        description="The default color for the image, represented as an integer.",
    )
