from pydantic import Field
from nodetool.metadata.types import ImageRef, ImageTensor
from nodetool.common.comfy_node import ComfyNode


class RepeatImageBatch(ComfyNode):
    image: ImageRef = Field(default=ImageRef(), description="The image to repeat.")
    amount: int = Field(
        default=1, description="The number of times to repeat the image."
    )

    @classmethod
    def return_type(cls):
        return {"image": ImageRef}
