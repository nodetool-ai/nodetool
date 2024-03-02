from pydantic import Field
from genflow.metadata.types import ImageTensor
from genflow.nodes.comfy import ComfyNode


class RepeatImageBatch(ComfyNode):
    image: ImageTensor = Field(
        default=ImageTensor(), description="The image to repeat."
    )
    amount: int = Field(
        default=1, description="The number of times to repeat the image."
    )

    @classmethod
    def return_type(cls):
        return {"image": ImageTensor}
