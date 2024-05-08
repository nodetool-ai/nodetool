import os
from enum import Enum
import PIL.Image
import PIL.ImageDraw
import PIL.ImageEnhance
import PIL.ImageFilter
import PIL.ImageFont
import PIL.ImageOps
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import ImageRef
from nodetool.workflows.base_node import BaseNode
import numpy as np
from pydantic import Field
from typing import Literal

current_dir = os.path.dirname(os.path.realpath(__file__))
fonts_dir = os.path.join(current_dir, "..", "..", "..", "..", "fonts")


class Background(BaseNode):
    """
    The Background Node creates a blank background.

    This node is mainly used for generating a base layer for image processing tasks. It produces a uniform image, having a user-specified width, height and color. The color is given in a hexadecimal format, defaulting to white if not specified.

    #### Applications
    - As a base layer for creating composite images.
    - As a starting point for generating patterns or graphics.
    - When blank backgrounds of specific colors are required for visualization tasks.
    """

    width: int = Field(default=512, ge=1, le=4096)
    height: int = Field(default=512, ge=1, le=4096)
    color: str = Field(default="#FFFFFF")

    async def process(self, context: ProcessingContext) -> ImageRef:
        img = PIL.Image.new("RGB", (self.width, self.height), self.color)
        return await context.image_from_pil(img)


class RenderText(BaseNode):
    """
    This node allows you to add text to images.

    This node takes text, font updates, coordinates (where to place the text), and an image to work with. A user can use the Render Text Node to add a label or title to an image, watermark an image, or place a caption directly on an image.

    The Render Text Node offers customizable options, including the ability to choose the text's font, size, color, and alignment (left, center, or right). Text placement can also be defined, providing flexibility to place the text wherever you see fit.

    #### Applications
    - Labeling images in a image gallery or database.
    - Watermarking images for copyright protection.
    - Adding custom captions to photographs.
    - Creating instructional images to guide the reader's view.
    """

    class ChannelEnum(str, Enum):
        RED = "R"
        GREEN = "G"
        BLUE = "B"

    class TextAlignment(str, Enum):
        LEFT = "left"
        CENTER = "center"
        RIGHT = "right"

    class TextFont(str, Enum):
        DejaVuSansBold = "DejaVuSans-Bold.ttf"
        DejaVuSans = "DejaVuSans.ttf"
        FreeSans = "FreeSans.ttf"

    text: str = Field(default="", description="The text to render.")
    font: TextFont = Field(default=TextFont.DejaVuSans, description="The font to use.")
    x: float = Field(default=0, ge=0, le=1, description="The x coordinate.")
    y: float = Field(default=0, ge=0, le=1, description="The y coordinate.")
    size: int = Field(default=12, ge=1, le=512, description="The font size.")
    color: str = Field(default="#000000", description="The font color.")
    align: TextAlignment = TextAlignment.LEFT
    image: ImageRef = Field(default=ImageRef(), description="The image to render on.")

    async def process(self, context: ProcessingContext) -> ImageRef:
        image = await context.image_to_pil(self.image)
        x = int((image.width * self.x))
        y = int((image.height * self.y))
        draw = PIL.ImageDraw.Draw(image)
        font = PIL.ImageFont.truetype(os.path.join(fonts_dir, self.font), self.size)
        draw.text((x, y), self.text, font=font, fill=self.color, align=self.align.value)
        return await context.image_from_pil(image)


class GaussianNoise(BaseNode):
    """
    This node creates and adds Gaussian noise to an image.

    The Gaussian Noise Node is designed to simulate realistic distortions that can occur in a photographic image. It generates a noise-filled image using the Gaussian (normal) distribution. The noise level can be adjusted using the mean and standard deviation parameters.

    #### Applications
    - Simulating sensor noise in synthetic data.
    - Testing image-processing algorithms' resilience to noise.
    - Creating artistic effects in images.
    """

    mean: float = Field(default=0.0)
    stddev: float = Field(default=1.0)
    width: int = Field(default=512, ge=1, le=1024)
    height: int = Field(default=512, ge=1, le=1024)

    async def process(self, context: ProcessingContext) -> ImageRef:
        image = np.random.normal(self.mean, self.stddev, (self.height, self.width, 3))
        image = (np.clip(image, 0, 1) * 255).astype(np.uint8)
        image = PIL.Image.fromarray(image)
        return await context.image_from_pil(image)
