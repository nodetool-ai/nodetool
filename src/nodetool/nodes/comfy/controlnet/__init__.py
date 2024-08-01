from pydantic import Field
from nodetool.metadata.types import ImageRef
from nodetool.common.comfy_node import MAX_RESOLUTION
from nodetool.common.comfy_node import ComfyNode


class PreprocessImage(ComfyNode):
    image: ImageRef = Field(default=ImageRef(), description="The image to preprocess.")
    resolution: int = Field(
        default=512,
        description="The width of the image to generate.",
        ge=64,
        le=MAX_RESOLUTION,
    )

    @classmethod
    def return_type(cls):
        return {"image": ImageRef}

    @classmethod
    def is_visible(cls):
        return cls is not PreprocessImage
