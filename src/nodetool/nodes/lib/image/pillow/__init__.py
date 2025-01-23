from typing import Any
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import ImageRef
from nodetool.workflows.base_node import BaseNode
from pydantic import Field
import PIL.Image
import PIL.ImageOps


class Blend(BaseNode):
    """
    Blend two images with adjustable alpha mixing.
    blend, mix, fade, transition

    Use cases:
    - Create smooth transitions between images
    - Adjust opacity of overlays
    - Combine multiple exposures or effects
    """

    image1: ImageRef = Field(
        default=ImageRef(), description="The first image to blend."
    )
    image2: ImageRef = Field(
        default=ImageRef(), description="The second image to blend."
    )
    alpha: float = Field(default=0.5, ge=0.0, le=1.0, description="The mix ratio.")

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self.image1.is_empty():
            raise ValueError("The first image is not connected.")

        if self.image2.is_empty():
            raise ValueError("The second image is not connected.")

        image1 = await context.image_to_pil(self.image1)
        image2 = await context.image_to_pil(self.image2)
        if image1.size != image2.size:
            image2 = PIL.ImageOps.fit(image2, image1.size)
        image = PIL.Image.blend(image1, image2, self.alpha)
        return await context.image_from_pil(image)


class Composite(BaseNode):
    """
    Combine two images using a mask for advanced compositing.
    composite, mask, blend, layering

    Use cases:
    - Create complex image compositions
    - Apply selective blending or effects
    - Implement advanced photo editing techniques
    """

    image1: ImageRef = Field(
        default=ImageRef(), description="The first image to composite."
    )
    image2: ImageRef = Field(
        default=ImageRef(), description="The second image to composite."
    )
    mask: ImageRef = Field(
        default=ImageRef(), description="The mask to composite with."
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self.image1.is_empty():
            raise ValueError("The first image is not connected.")

        if self.image2.is_empty():
            raise ValueError("The second image is not connected.")

        image1 = await context.image_to_pil(self.image1)
        image2 = await context.image_to_pil(self.image2)
        mask = await context.image_to_pil(self.mask)
        image1 = image1.convert("RGBA")
        image2 = image2.convert("RGBA")
        mask = mask.convert("RGBA")
        if image1.size != image2.size:
            image2 = PIL.ImageOps.fit(image2, image1.size)
        if image1.size != mask.size:
            mask = PIL.ImageOps.fit(mask, image1.size)
        image = PIL.Image.composite(image1, image2, mask)
        return await context.image_from_pil(image)
