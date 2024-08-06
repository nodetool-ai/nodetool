from enum import Enum
import random
from typing import Any
import numpy as np
from pydantic import Field
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
        return {"image": ImageRef}

    def assign_property(self, name: str, value: Any):
        if name == "image" and isinstance(value, str):
            self.image = ImageRef(uri=value)
        else:
            super().assign_property(name, value)

    async def process(self, context: ProcessingContext):
        return {"image": self.image}


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

    async def process(self, context: ProcessingContext):
        rand = "".join(random.choice("abcdefghijklmnopqrstupvxyz") for x in range(5))
        name = f"{self.filename_prefix}_{rand}.png"
        img = await context.image_to_pil(self.images)
        ref = await context.image_from_pil(img, name=name)
        return {"image": ref}

    @classmethod
    def return_type(cls):
        return {"image": ImageRef}


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
