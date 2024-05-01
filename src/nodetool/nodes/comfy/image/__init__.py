from enum import Enum
import random
from typing import Any
import numpy as np
from pydantic import Field, validator
from nodetool.metadata.types import ImageRef
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import ImageTensor, Mask
from nodetool.common.comfy_node import ComfyNode


class ImageCompositeMasked(ComfyNode):
    destination: ImageTensor = Field(
        default=ImageTensor(), description="The destination image."
    )
    source: ImageTensor = Field(default=ImageTensor(), description="The source image.")
    x: int = Field(default=0, description="The x position.")
    y: int = Field(default=0, description="The y position.")
    resize_source: bool = Field(
        default=False, description="Whether to resize the source."
    )
    mask: Mask = Field(None, description="The mask to use.")

    @classmethod
    def return_type(cls):
        return {"image": ImageTensor}


class LoadImage(ComfyNode):
    """
    The Load Image node can be used to to load an image. Images can be uploaded in the asset manager or by dropping an image onto the node. Once the image has been uploaded they can be selected inside the node.
    """

    image: ImageRef = Field(default=ImageRef(), description="The image to load.")
    upload: str = Field(default="", description="unused")

    @validator("image", pre=True)
    def validate_image(cls, v):
        if isinstance(v, str):
            v = ImageRef(uri=v)
        return v

    @classmethod
    def return_type(cls):
        return {"image": ImageTensor}

    def assign_property(self, name: str, value: Any):
        if name == "image" and isinstance(value, str):
            # comfy import with local filename
            return
        super().assign_property(name, value)


class ColorChannel(str, Enum):
    ALPHA = "alpha"
    RED = "red"
    GREEN = "green"
    BLUE = "blue"


class LoadImageMask(ComfyNode):
    image: ImageTensor = Field(default=ImageTensor(), description="The image to load.")
    channel: ColorChannel = Field(
        default=ColorChannel.ALPHA, description="The color channel to use."
    )

    @validator("image", pre=True)
    def validate_image(cls, v):
        if isinstance(v, str):
            v = ImageRef(uri=v)
        return v

    @classmethod
    def return_type(cls):
        return {"mask": Mask}


class SaveImage(ComfyNode):
    """
    The Save Image node can be used to save images. To simply preview an image inside the node graph use the Preview Image node. It can be hard to keep track of all the images that you generate. To help with organizing your images you can pass specially formatted strings to an output node with a file_prefix widget. For more information about how to format your string see this page.
    """

    images: ImageTensor = Field(default=ImageTensor(), description="The image to save.")
    filename_prefix: str = Field(
        default="",
        description="The prefix for the filename where the image will be saved.",
    )

    async def process(self, context: ProcessingContext):
        image = self.images[0]  # type: ignore
        i = 255.0 * image.cpu().detach().numpy()  # type: ignore
        img = np.clip(i, 0, 255).astype(np.uint8)
        rand = "".join(random.choice("abcdefghijklmnopqrstupvxyz") for x in range(5))
        name = f"{self.filename_prefix}_{rand}.png"
        ref = await context.image_from_numpy(img, name=name)
        return {"image": ref}

    @classmethod
    def return_type(cls):
        return {"image": ImageRef}


class PreviewImage(SaveImage):
    """
    The Preview Image node can be used to preview images inside the node graph.
    """

    pass


class ImageInvert(ComfyNode):
    """
    The Invert Image node can be used to to invert the colors of an image.
    """

    image: ImageTensor = Field(
        default=ImageTensor(), description="The image to invert."
    )

    @classmethod
    def get_title(cls):
        return "Invert Image"

    @classmethod
    def return_type(cls):
        return {"image": ImageTensor}


class ImageBatch(ComfyNode):
    image1: ImageTensor = Field(
        default=ImageTensor(), description="The image to batch."
    )
    image2: ImageTensor = Field(
        default=ImageTensor(), description="The image to batch."
    )

    @classmethod
    def return_type(cls):
        return {"image": ImageTensor}


class ImagePadForOutpaint(ComfyNode):
    """
    The Pad Image for Outpainting node can be used to to add padding to an image for outpainting. This image can then be given to an inpaint diffusion model via the VAE Encode for Inpainting.
    """

    image: ImageTensor = Field(default=ImageTensor(), description="The image to pad.")
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
        return {"image": ImageTensor, "mask": Mask}
