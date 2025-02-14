from pydantic import Field
from nodetool.metadata.types import ImageRef, ImageTensor
from nodetool.nodes.comfy.comfy_node import ComfyNode
import comfy_extras.nodes_images


class RepeatImageBatch(ComfyNode):
    """
    Repeat an image a given number of times.
    """

    _comfy_class = comfy_extras.nodes_images.RepeatImageBatch

    image: ImageRef = Field(default=ImageRef(), description="The image to repeat.")
    amount: int = Field(
        default=1, description="The number of times to repeat the image."
    )

    @classmethod
    def return_type(cls):
        return {"image": ImageRef}
