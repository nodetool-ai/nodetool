from base64 import b64decode
import PIL.Image
from io import BytesIO
from genflow.common.environment import Environment
from genflow.workflows.processing_context import ProcessingContext
from genflow.metadata.types import ImageRef
from genflow.workflows.genflow_node import GenflowNode
from pydantic import Field
from enum import Enum
from typing import Literal
from enum import Enum


class CreateImageNode(GenflowNode):
    """
    This node generates images from textual descriptions using DALL-E, a technology by OpenAI.

    First, you feed a textual description to the node. This description helps DALL-E understand what kind of image you want to produce. For example, you can describe a sunset or a rare animal – the node will generate an image accordingly.

    The node allows you to set the size of the output image. This feature provides flexibility, enabling you to fit the image into different layouts. You can choose from three sizes: 1024x1024, 512x512, or 256x256 pixels.

    #### Applications
    - Generate custom graphics for presentations: Describe the scenario you need to visualize, and get the original image.
    - Concept development: Visualize your ideas instantly without drawing skills.
    - Content creation: Generate unique visuals for posts, articles, or covers.
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
            prompt=self.prompt,
            size=self.size.value,
            quality=self.quality.value,
            style=self.style.value,
            response_format="b64_json",
        )
        assert len(image.data) > 0
        b64 = image.data[0].b64_json
        assert b64 is not None
        file = b64decode(b64)
        pil_image = PIL.Image.open(BytesIO(file))
        return await context.image_from_pil(pil_image)
