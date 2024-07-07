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

        return await context.image_from_pil(
            image=image, name=name, parent_id=self.folder.asset_id
        )


class GetImageMetadata(BaseNode):
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


class ConvertImageToTensor(BaseNode):
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


class ConvertTensorToImage(BaseNode):
    """
    Convert tensor data to PIL Image format.

    Keywords: tensor, image, conversion, denormalization

    Use cases:
    - Visualize tensor data as images
    - Save processed tensor results as images
    - Convert model outputs back to viewable format
    """

    tensor: Tensor = Field(
        default=Tensor(),
        description="The input tensor to convert to an image. Should have either 1, 3, or 4 channels.",
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self.tensor.is_empty():
            raise ValueError("The input tensor is not connected.")

        tensor_data = self.tensor.to_numpy()
        if tensor_data.ndim not in [2, 3]:
            raise ValueError("The tensor should have 2 or 3 dimensions (HxW or HxWxC).")
        if (tensor_data.ndim == 3) and (tensor_data.shape[2] not in [1, 3, 4]):
            raise ValueError("The tensor channels should be either 1, 3, or 4.")
        if (tensor_data.ndim == 3) and (tensor_data.shape[2] == 1):
            tensor_data = tensor_data.reshape(
                tensor_data.shape[0], tensor_data.shape[1]
            )
        tensor_data = (tensor_data * 255).astype(np.uint8)
        output_image = PIL.Image.fromarray(tensor_data)
        return await context.image_from_pil(output_image)


class PasteImage(BaseNode):
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


class BlendImages(BaseNode):
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


class CompositeImages(BaseNode):
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
