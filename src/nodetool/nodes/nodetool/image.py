from typing import Any
from nodetool.metadata.types import FolderRef, NPArray
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import ImageRef
from nodetool.workflows.base_node import BaseNode
from datetime import datetime
from pydantic import Field
import PIL
import PIL.Image


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
    name: str = Field(
        default="%Y-%m-%d_%H-%M-%S.png",
        description="""
        Name of the output file.
        You can use time and date variables to create unique names:
        %Y - Year
        %m - Month
        %d - Day
        %H - Hour
        %M - Minute
        %S - Second
        """,
    )

    def required_inputs(self):
        return ["image"]

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self.image.is_empty():
            raise ValueError("The input image is not connected.")

        image = await context.image_to_pil(self.image)
        filename = datetime.now().strftime(self.name)
        parent_id = self.folder.asset_id if self.folder.is_set() else None

        return await context.image_from_pil(
            image=image, name=filename, parent_id=parent_id
        )

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


class Scale(BaseNode):
    """
    Enlarge or shrink an image by a scale factor.
    image, resize, scale

    - Adjust image dimensions for display galleries
    - Standardize image sizes for machine learning datasets
    - Create thumbnail versions of images
    """

    image: ImageRef = Field(default=ImageRef(), description="The image to scale.")
    scale: float = Field(default=1.0, ge=0.0, le=10.0, description="The scale factor.")

    async def process(self, context: ProcessingContext) -> ImageRef:
        image = await context.image_to_pil(self.image)
        width = int((image.width * self.scale))
        height = int((image.height * self.scale))
        image = image.resize((width, height), PIL.Image.Resampling.LANCZOS)
        return await context.image_from_pil(image)


class Resize(BaseNode):
    """
    Change image dimensions to specified width and height.
    image, resize

    - Preprocess images for machine learning model inputs
    - Optimize images for faster web page loading
    - Create uniform image sizes for layouts
    """

    image: ImageRef = Field(default=ImageRef(), description="The image to resize.")
    width: int = Field(default=512, ge=0, le=4096, description="The target width.")
    height: int = Field(default=512, ge=0, le=4096, description="The target height.")

    async def process(self, context: ProcessingContext) -> ImageRef:
        image = await context.image_to_pil(self.image)
        res = image.resize((self.width, self.height), PIL.Image.LANCZOS)  # type: ignore
        return await context.image_from_pil(res)


class Crop(BaseNode):
    """
    Crop an image to specified coordinates.
    image, crop

    - Remove unwanted borders from images
    - Focus on particular subjects within an image
    - Simplify images by removing distractions
    """

    image: ImageRef = Field(default=ImageRef(), description="The image to crop.")
    left: int = Field(default=0, ge=0, le=4096, description="The left coordinate.")
    top: int = Field(default=0, ge=0, le=4096, description="The top coordinate.")
    right: int = Field(default=512, ge=0, le=4096, description="The right coordinate.")
    bottom: int = Field(
        default=512, ge=0, le=4096, description="The bottom coordinate."
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
        image = await context.image_to_pil(self.image)
        res = image.crop((self.left, self.top, self.right, self.bottom))
        return await context.image_from_pil(res)


class Fit(BaseNode):
    """
    Resize an image to fit within specified dimensions while preserving aspect ratio.
    image, resize, fit

    - Resize images for online publishing requirements
    - Preprocess images to uniform sizes for machine learning
    - Control image display sizes for web development
    """

    image: ImageRef = Field(default=ImageRef(), description="The image to fit.")
    width: int = Field(default=512, ge=1, le=4096, description="Width to fit to.")
    height: int = Field(default=512, ge=1, le=4096, description="Height to fit to.")

    async def process(self, context: ProcessingContext) -> ImageRef:
        image = await context.image_to_pil(self.image)
        res = PIL.ImageOps.fit(image, (self.width, self.height), PIL.Image.LANCZOS)  # type: ignore
        return await context.image_from_pil(res)
