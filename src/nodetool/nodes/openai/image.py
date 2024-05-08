from base64 import b64decode
import PIL.Image
from io import BytesIO
from nodetool.common.environment import Environment
from nodetool.common.openai_nodes import calculate_cost
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import ImageRef
from nodetool.workflows.base_node import BaseNode
from pydantic import Field
from enum import Enum
from typing import Literal
from enum import Enum


class CreateImage(BaseNode):
    """
    Generates images from textual descriptions using DALLE-3.
    image, t2i, tti, text-to-image, create, generate, dall-e, picture, photo, art, drawing, illustration
    Returns an image based on the provided textual prompt.
    """

    class Size(str, Enum):
        _1024x1024 = "1024x1024"
        _1792x1024 = "1792x1024"
        _1024x1792 = "1024x1792"

    class Style(str, Enum):
        vivid = "vivid"
        natural = "natural"

    class Quality(str, Enum):
        standard = "standard"
        hd = "hd"

    prompt: str = Field(default="", description="The prompt to use.")
    size: Size = Field(
        default=Size._1024x1024, description="The size of the image to generate."
    )
    quality: Quality = Field(
        default=Quality.standard, description="The quality of the image to generate."
    )
    style: Style = Field(default=Style.natural, description="The style to use.")

    async def process(self, context: ProcessingContext) -> ImageRef:
        client = Environment.get_openai_client()
        image = await client.images.generate(
            model="dall-e-3",
            prompt=self.prompt,
            size=self.size.value,
            quality=self.quality.value,
            style=self.style.value,
            response_format="b64_json",
        )
        model = f"dalle-3 {self.quality.value} {self.size.value}"
        cost = calculate_cost(model, len(self.prompt), 0)

        await context.create_prediction(
            provider="openai",
            node_id=self._id,
            node_type=self.get_node_type(),
            model=model,
            cost=cost,
        )

        assert len(image.data) > 0
        b64 = image.data[0].b64_json
        assert b64 is not None
        file = b64decode(b64)
        pil_image = PIL.Image.open(BytesIO(file))
        return await context.image_from_pil(pil_image)
