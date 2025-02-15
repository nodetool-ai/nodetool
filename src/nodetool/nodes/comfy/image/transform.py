from pydantic import Field
from nodetool.metadata.types import ImageRef, ImageRef
from nodetool.nodes.comfy.comfy_node import ComfyNode

import comfy_extras.nodes_images


class ImageCrop(ComfyNode):
    """
    Crop an image to a given size.
    """

    _comfy_class = comfy_extras.nodes_images.ImageCrop

    image: ImageRef = Field(default=ImageRef(), description="The image to crop.")
    width: int = Field(default=512, description="Width of the crop.")
    height: int = Field(default=512, description="Height of the crop.")
    x: int = Field(default=0, description="X position where the crop starts.")
    y: int = Field(default=0, description="Y position where the crop starts.")

    @classmethod
    def return_type(cls):
        return {"image": ImageRef}
