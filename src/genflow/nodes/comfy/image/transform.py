from pydantic import Field
from genflow.metadata.types import ImageTensor
from genflow.nodes.comfy import ComfyNode


class ImageCrop(ComfyNode):
    image: ImageTensor = Field(default=ImageTensor(), description="The image to crop.")
    width: int = Field(default=512, description="Width of the crop.")
    height: int = Field(default=512, description="Height of the crop.")
    x: int = Field(default=0, description="X position where the crop starts.")
    y: int = Field(default=0, description="Y position where the crop starts.")

    @classmethod
    def return_type(cls):
        return {"image": ImageTensor}
