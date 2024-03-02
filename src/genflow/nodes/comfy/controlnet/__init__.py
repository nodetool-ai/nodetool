from pydantic import Field
from genflow.metadata.types import Conditioning, ControlNet, ImageTensor
from genflow.nodes.comfy import MAX_RESOLUTION, ComfyNode


class PreprocessImage(ComfyNode):
    image: ImageTensor = Field(
        default=ImageTensor(), description="The image to preprocess."
    )
    resolution: int = Field(
        default=512,
        description="The width of the image to generate.",
        ge=64,
        le=MAX_RESOLUTION,
    )

    @classmethod
    def return_type(cls):
        return {"image": ImageTensor}
