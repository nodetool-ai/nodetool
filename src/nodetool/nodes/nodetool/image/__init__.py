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
from typing import Literal


class Save(BaseNode):
    """
    Save an image to a folder.
    """

    image: ImageRef = ImageRef()
    folder: FolderRef = Field(
        default=FolderRef(), description="The folder to save the image in."
    )
    name: str = Field(default="%Y-%m-%d_%H-%M-%S.png")

    async def process(self, context: ProcessingContext) -> ImageRef:
        image = await context.image_to_pil(self.image)

        name = datetime.now().strftime(self.name)

        return await context.image_from_pil(
            image=image, name=name, parent_id=self.folder.asset_id
        )


class ImageToTensor(BaseNode):
    """
    Convert an image to a tensor.
    """

    image: ImageRef = Field(
        description="The input image to convert to a tensor. The image should have either 1 (grayscale), 3 (RGB), or 4 (RGBA) channels."
    )

    async def process(self, context: ProcessingContext) -> Tensor:
        image = await context.image_to_pil(self.image)
        image_data = np.array(image)
        tensor_data = image_data / 255.0
        if len(tensor_data.shape) == 2:
            tensor_data = tensor_data[:, :, np.newaxis]
        return Tensor.from_numpy(tensor_data)


class TensorToImage(BaseNode):
    """
    Convert a tensor to an image.
    """

    tensor: Tensor = Field(
        description="The input tensor to convert to an image. Should have either 1, 3, or 4 channels."
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
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


class Paste(BaseNode):
    """
    Paste an image into another image. The `left` and `top` parameters specify the coordinates of the top-left corner of the pasted image.
    """

    image: ImageRef = Field(default=ImageRef(), description="The image to paste into.")
    paste: ImageRef = Field(default=ImageRef(), description="The image to paste.")
    left: int = Field(default=0, ge=0, le=4096, description="The left coordinate.")
    top: int = Field(default=0, ge=0, le=4096, description="The top coordinate.")

    async def process(self, context: ProcessingContext) -> ImageRef:
        image = await context.image_to_pil(self.image)
        paste = await context.image_to_pil(self.paste)
        image.paste(paste, (self.left, self.top))
        return await context.image_from_pil(image)


class Blend(BaseNode):
    """
    Blend two images together. The `alpha` parameter controls the mix ratio.
    """

    image1: ImageRef = Field(
        default=ImageRef(), description="The first image to blend."
    )
    image2: ImageRef = Field(
        default=ImageRef(), description="The second image to blend."
    )
    alpha: float = Field(default=0.5, ge=0.0, le=1.0, description="The mix ratio.")

    async def process(self, context: ProcessingContext) -> ImageRef:
        image1 = await context.image_to_pil(self.image1)
        image2 = await context.image_to_pil(self.image2)
        if image1.size != image2.size:
            image2 = PIL.ImageOps.fit(image2, image1.size)
        image = PIL.Image.blend(image1, image2, self.alpha)
        return await context.image_from_pil(image)


class Composite(BaseNode):
    """
    Combine two images into a single output image.
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
