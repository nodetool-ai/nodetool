from enum import Enum
import random
from typing import Any
import numpy as np
from pydantic import Field, validator
from genflow.metadata.types import ImageRef
from genflow.workflows.processing_context import ProcessingContext
from genflow.metadata.types import ImageTensor, Mask
from genflow.nodes.comfy import ComfyNode


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
    pass


class ImageInvert(ComfyNode):
    image: ImageTensor = Field(
        default=ImageTensor(), description="The image to invert."
    )

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
    def return_type(cls):
        return {"image": ImageTensor, "mask": Mask}
