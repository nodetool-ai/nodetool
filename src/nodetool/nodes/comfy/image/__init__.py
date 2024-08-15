import asyncio
from enum import Enum
import random
from typing import Any
import numpy as np
from PIL import ImageSequence, ImageOps
from pydantic import Field
import torch
import node_helpers
from nodetool.metadata.types import ImageRef, Mask
from nodetool.common.comfy_node import ComfyNode
from nodetool.nodes.nodetool import constant
from nodetool.workflows.processing_context import ProcessingContext


class ImageCompositeMasked(ComfyNode):
    destination: ImageRef = Field(
        default=ImageRef(), description="The destination image."
    )
    source: ImageRef = Field(default=ImageRef(), description="The source image.")
    x: int = Field(default=0, description="The x position.")
    y: int = Field(default=0, description="The y position.")
    resize_source: bool = Field(
        default=False, description="Whether to resize the source."
    )
    mask: Mask = Field(None, description="The mask to use.")

    @classmethod
    def return_type(cls):
        return {"image": ImageRef}


class ColorChannel(str, Enum):
    ALPHA = "alpha"
    RED = "red"
    GREEN = "green"
    BLUE = "blue"


class LoadImage(ComfyNode):
    """
    The Load Image node can be used to to load an image. Images can be uploaded in the asset manager or by dropping an image onto the node. Once the image has been uploaded they can be selected inside the node.
    """

    image: ImageRef = Field(default=ImageRef(), description="The image to load.")

    @classmethod
    def return_type(cls):
        return {"image": ImageRef, "mask": Mask}

    def assign_property(self, name: str, value: Any):
        if name == "image" and isinstance(value, str):
            self.image = ImageRef(uri=value)
        else:
            super().assign_property(name, value)

    async def process(self, context: ProcessingContext):
        output_images = []
        output_masks = []
        w, h = None, None

        excluded_formats = ["MPO"]
        img = await context.image_to_pil(self.image)

        for i in ImageSequence.Iterator(img):
            i = node_helpers.pillow(ImageOps.exif_transpose, i)

            if i.mode == "I":
                i = i.point(lambda i: i * (1 / 255))
            image = i.convert("RGB")

            if len(output_images) == 0:
                w = image.size[0]
                h = image.size[1]

            if image.size[0] != w or image.size[1] != h:
                continue

            image = np.array(image).astype(np.float32) / 255.0
            image = torch.from_numpy(image)[None,]
            if "A" in i.getbands():
                mask = np.array(i.getchannel("A")).astype(np.float32) / 255.0
                mask = 1.0 - torch.from_numpy(mask)
            else:
                mask = torch.zeros((64, 64), dtype=torch.float32, device="cpu")
            output_images.append(image)
            output_masks.append(mask.unsqueeze(0))

        if len(output_images) > 1 and img.format not in excluded_formats:
            output_image = torch.cat(output_images, dim=0)
            output_mask = torch.cat(output_masks, dim=0)
        else:
            output_image = output_images[0]
            output_mask = output_masks[0]

        output_image_ref = await context.image_from_tensor(output_image)

        return {"image": output_image_ref, "mask": Mask(data=output_mask)}


class LoadImageMask(ComfyNode):
    image: ImageRef = Field(default=ImageRef(), description="The image to load.")
    channel: ColorChannel = Field(
        default=ColorChannel.ALPHA, description="The color channel to use."
    )

    @classmethod
    def return_type(cls):
        return {"mask": Mask}

    async def process(self, context: ProcessingContext):
        img = await context.image_to_pil(self.image)
        img = np.array(img)

        if self.channel == ColorChannel.RED:
            mask = img[:, :, 0]
        elif self.channel == ColorChannel.GREEN:
            mask = img[:, :, 1]
        elif self.channel == ColorChannel.BLUE:
            mask = img[:, :, 2]
        else:
            mask = img[:, :, 3]

        return {"mask": Mask(data=mask)}


class SaveImage(ComfyNode):
    """
    The Save Image node can be used to save images. To simply preview an image inside the node graph use the Preview Image node. It can be hard to keep track of all the images that you generate. To help with organizing your images you can pass specially formatted strings to an output node with a file_prefix widget.
    """

    images: ImageRef = Field(default=ImageRef(), description="The image to save.")
    filename_prefix: str = Field(
        default="",
        description="The prefix for the filename where the image will be saved.",
    )

    async def _save_image(self, context: ProcessingContext, image: bytes) -> ImageRef:
        rand = "".join(random.choice("abcdefghijklmnopqrstupvxyz") for x in range(5))
        name = f"{self.filename_prefix}_{rand}.png"
        return await context.image_from_bytes(image, name)

    async def process(self, context: ProcessingContext):
        if self.images.is_empty():
            raise ValueError("The input image is not connected.")
        if isinstance(self.images.data, list):
            images = await asyncio.gather(
                *[self._save_image(context, image) for image in self.images.data]
            )
        elif isinstance(self.images.data, bytes):
            images = await self._save_image(context, self.images.data)
        else:
            raise ValueError("Input image is not from a Comfy node")

        return images


class PreviewImage(SaveImage):
    """
    The Preview Image node can be used to preview images inside the node graph.
    """

    pass


class ImagePadForOutpaint(ComfyNode):
    """
    The Pad Image for Outpainting node can be used to to add padding to an image for outpainting. This image can then be given to an inpaint diffusion model via the VAE Encode for Inpainting.
    """

    image: ImageRef = Field(default=ImageRef(), description="The image to pad.")
    left: int = Field(default=0, description="The padding size on the left side.")
    top: int = Field(default=0, description="The padding size on the top side.")
    right: int = Field(default=0, description="The padding size on the right side.")
    bottom: int = Field(default=0, description="The padding size on the bottom side.")
    feathering: int = Field(
        default=40,
        description="The feathering value for softening the edges of the padding.",
    )

    @classmethod
    def get_title(cls):
        return "Pad Image for Outpainting"

    @classmethod
    def return_type(cls):
        return {"image": ImageRef, "mask": Mask}
