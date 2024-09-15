from typing import Any
import PIL.Image
import PIL.ImageDraw
import PIL.ImageEnhance
import PIL.ImageFilter
import PIL.ImageFont
import PIL.ImageOps
from nodetool.metadata.types import FolderRef, Tensor
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import ImageRef
from nodetool.workflows.base_node import BaseNode
from datetime import datetime
import numpy as np
from pydantic import Field


class SaveImage(BaseNode):
    """
    Save an image to specified folder with customizable name format.
    save, image, folder, naming

    Use cases:
    - Save generated images with timestamps
    - Organize outputs into specific folders
    - Create backups of processed images
    """

    image: ImageRef = Field(default=ImageRef(), description="The image to save.")
    folder: FolderRef = Field(
        default=FolderRef(), description="The folder to save the image in."
    )
    name: str = Field(default="%Y-%m-%d_%H-%M-%S.png")

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self.image.is_empty():
            raise ValueError("The input image is not connected.")

        image = await context.image_to_pil(self.image)

        name = datetime.now().strftime(self.name)
        parent_id = self.folder.asset_id if self.folder.is_set() else None

        return await context.image_from_pil(image=image, name=name, parent_id=parent_id)

    def result_for_client(self, result: dict[str, Any]) -> dict[str, Any]:
        return self.result_for_all_outputs(result)


class GetMetadata(BaseNode):
    """
    Get metadata about the input image.
    metadata, properties, analysis, information

    Use cases:
    - Use width and height for layout calculations
    - Analyze image properties for processing decisions
    - Gather information for image cataloging or organization
    """

    image: ImageRef = Field(default=ImageRef(), description="The input image.")

    @classmethod
    def return_type(cls):
        return {
            "format": str,
            "mode": str,
            "width": int,
            "height": int,
            "channels": int,
        }

    async def process(self, context: ProcessingContext):
        if self.image.is_empty():
            raise ValueError("The input image is not connected.")

        image = await context.image_to_pil(self.image)

        # Get basic image information
        format = image.format if image.format else "Unknown"
        mode = image.mode
        width, height = image.size
        channels = len(image.getbands())

        return {
            "format": format,
            "mode": mode,
            "width": width,
            "height": height,
            "channels": channels,
        }


class BatchToList(BaseNode):
    """
    Convert an image batch to a list of image references.
    batch, list, images, processing

    Use cases:
    - Convert comfy batch outputs to list format
    """

    batch: ImageRef = Field(
        default=ImageRef(), description="The batch of images to convert."
    )

    async def process(self, context: ProcessingContext) -> list[ImageRef]:
        if self.batch.is_empty():
            raise ValueError("The input batch is not connected.")
        if self.batch.data is None:
            raise ValueError("The input batch is empty.")
        if not isinstance(self.batch.data, list):
            raise ValueError("The input batch is not a list.")

        return [ImageRef(data=data) for data in self.batch.data]


class ConvertToTensor(BaseNode):
    """
    Convert PIL Image to normalized tensor representation.
    image, tensor, conversion, normalization

    Use cases:
    - Prepare images for machine learning models
    - Convert between image formats for processing
    - Normalize image data for consistent calculations
    """

    image: ImageRef = Field(
        default=ImageRef(),
        description="The input image to convert to a tensor. The image should have either 1 (grayscale), 3 (RGB), or 4 (RGBA) channels.",
    )

    async def process(self, context: ProcessingContext) -> Tensor:
        if self.image.is_empty():
            raise ValueError("The input image is not connected.")

        image = await context.image_to_pil(self.image)
        image_data = np.array(image)
        tensor_data = image_data / 255.0
        if len(tensor_data.shape) == 2:
            tensor_data = tensor_data[:, :, np.newaxis]
        return Tensor.from_numpy(tensor_data)


class Paste(BaseNode):
    """
    Paste one image onto another at specified coordinates.
    paste, composite, positioning, overlay

    Use cases:
    - Add watermarks or logos to images
    - Combine multiple image elements
    - Create collages or montages
    """

    image: ImageRef = Field(default=ImageRef(), description="The image to paste into.")
    paste: ImageRef = Field(default=ImageRef(), description="The image to paste.")
    left: int = Field(default=0, ge=0, le=4096, description="The left coordinate.")
    top: int = Field(default=0, ge=0, le=4096, description="The top coordinate.")

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self.image.is_empty():
            raise ValueError("The input image is not connected.")
        if self.paste.is_empty():
            raise ValueError("The paste image is not connected.")

        image = await context.image_to_pil(self.image)
        paste = await context.image_to_pil(self.paste)
        image.paste(paste, (self.left, self.top))
        return await context.image_from_pil(image)


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

    Keywords: composite, mask, blend, layering

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
