from enum import Enum
from pydantic import Field
from nodetool.metadata.types import (
    VAE,
    FolderRef,
    ImageRef,
    ImageRef,
    Latent,
    Mask,
    NPArray,
)
from nodetool.common.comfy_node import MAX_RESOLUTION
from nodetool.common.comfy_node import ComfyNode
import nodes
import comfy_extras.nodes_mask
import comfy_extras.nodes_mochi
import comfy_extras.nodes_sd3
import random
import asyncio
from io import BytesIO

from nodetool.workflows.processing_context import ProcessingContext


class LatentCompositeMasked(ComfyNode):
    """
    The Latent Composite Masked node can be used to paste a masked latent into another.
    """

    _comfy_class = comfy_extras.nodes_mask.LatentCompositeMasked

    destination: Latent = Field(default=Latent(), description="The destination latent.")
    source: Latent = Field(default=Latent(), description="The source latent.")
    x: int = Field(default=0, description="The x position.")
    y: int = Field(default=0, description="The y position.")
    resize_source: bool = Field(
        default=False, description="Whether to resize the source."
    )
    mask: Mask = Field(Mask(), description="The mask to use.")

    @classmethod
    def return_type(cls):
        return {"latent": Latent}

    @classmethod
    def get_title(cls):
        return "Latent Composite Masked"


class EmptyLatentImage(ComfyNode):
    """
    The Empty Latent Image node can be used to create a new set of empty latent images. These latents can then be used inside e.g. a text2image workflow by noising and denoising them with a sampler node.
    """

    _comfy_class = nodes.EmptyLatentImage

    width: int = Field(
        default=512,
        description="The width of the latent image to generate.",
        ge=16,
        le=MAX_RESOLUTION,
    )
    height: int = Field(
        default=512,
        description="The height of the latent image to generate.",
        ge=16,
        le=MAX_RESOLUTION,
    )
    batch_size: int = Field(
        default=1,
        description="The batch size of the latent image to generate.",
        ge=1,
        le=MAX_RESOLUTION,
    )

    @classmethod
    def return_type(cls):
        return {"latent": Latent}


class EmptySD3LatentImage(ComfyNode):
    """
    The Empty SD3 Latent Image node can be used to create a new set of empty latent images. These latents can then be used inside e.g. a text2image workflow by noising and denoising them with a sampler node.
    """

    _comfy_class = comfy_extras.nodes_sd3.EmptySD3LatentImage

    width: int = Field(
        default=1024, description="The width of the latent image.", ge=16, le=16384
    )
    height: int = Field(
        default=1024, description="The height of the latent image.", ge=16, le=16384
    )
    batch_size: int = Field(default=1, description="The batch size.", ge=1, le=4096)

    @classmethod
    def get_title(cls):
        return "Empty SD3 Latent Image"

    @classmethod
    def return_type(cls):
        return {"latent": Latent}


class VAEEncode(ComfyNode):
    """
    The VAE Encode node can be used to encode pixel space images into latent space images, using the provided VAE.
    """

    _comfy_class = nodes.VAEEncode

    pixels: ImageRef = Field(default=ImageRef(), description="The image to encode.")
    vae: VAE = Field(default=VAE(), description="The VAE to use.")

    @classmethod
    def get_title(cls):
        return "VAE Encode"

    @classmethod
    def return_type(cls):
        return {"latent": Latent}


class VAEEncodeTiled(ComfyNode):
    """
    The VAE Encode Tiled node can be used to encode pixel space images into latent space images using a tiled approach. This is useful for encoding large images that might exceed memory limits when processed all at once.
    """

    _comfy_class = nodes.VAEEncodeTiled

    pixels: ImageRef = Field(
        default=ImageRef(), description="The image pixels to encode."
    )
    vae: VAE = Field(default=VAE(), description="The VAE to use for encoding.")
    tile_size: int = Field(
        default=512,
        description="The size of the tiles to encode.",
        ge=320,  # ge is 'greater than or equal to'
        le=4096,  # le is 'less than or equal to'
        multiple_of=64,
    )

    @classmethod
    def return_type(cls):
        return {"latent": Latent}


class VAEEncodeForInpaint(ComfyNode):
    """
    The VAE Encode for Inpaint node can be used to encode pixel space images into latent space specifically for inpainting tasks. It takes into account a mask to focus the encoding on specific areas of the image.
    """

    _comfy_class = nodes.VAEEncodeForInpaint

    pixels: ImageRef = Field(
        default=ImageRef(), description="The image pixels to encode for inpainting."
    )
    vae: VAE = Field(default=VAE(), description="The VAE to use for encoding.")
    mask: Mask = Field(default=Mask(), description="The mask to apply for inpainting.")
    grow_mask_by: int = Field(
        default=6,
        description="Amount to grow the mask by.",
        ge=0,  # ge is 'greater than or equal to'
        le=64,  # le is 'less than or equal to'
    )

    @classmethod
    def return_type(cls):
        return {"latent": Latent}


class VAEDecode(ComfyNode):
    """
    The VAE Decode node can be used to decode latent space images back into pixel space images, using the provided VAE.
    """

    _comfy_class = nodes.VAEDecode

    samples: Latent = Field(
        default=Latent(), description="The latent samples to decode."
    )
    vae: VAE = Field(default=VAE(), description="The VAE to use.")

    @classmethod
    def get_title(cls):
        return "VAE Decode"

    @classmethod
    def return_type(cls):
        return {"image": ImageRef}


class VAEDecodeTiled(ComfyNode):
    """
    The VAE Decode node can be used to decode latent space images back into pixel space images, using the provided VAE.
    The tiled version of the node is useful for decoding large images that would otherwise exceed the memory limits of the system.
    """

    _comfy_class = nodes.VAEDecodeTiled

    samples: Latent = Field(
        default=Latent(), description="The latent samples to decode."
    )
    vae: VAE = Field(default=VAE(), description="The VAE to use for decoding.")
    tile_size: int = Field(
        default=512,
        description="The size of the tiles to decode.",
        ge=320,  # ge is 'greater than or equal to'
        le=4096,  # le is 'less than or equal to'
        multiple_of=64,
    )

    @classmethod
    def return_type(cls):
        return {"image": ImageRef}


class SaveLatent(ComfyNode):
    """
    Save a latent to a file in the specified folder.
    latent, save, file, storage

    Use cases:
    - Persist latent data for later use
    - Export latent results from a workflow
    - Save intermediate latent outputs for debugging
    """

    samples: Latent = Field(
        default=Latent(),
        description="The latent samples to save.",
    )
    folder: FolderRef = Field(
        default=FolderRef(),
        description="The folder to save the latent in.",
    )
    name: str = Field(
        default="latent.latent",
        description="The name of the asset to save.",
    )

    async def process(self, context: ProcessingContext):
        if self.samples.data is None:
            raise ValueError("The input latent is not connected.")

        await context.create_asset(
            name=self.name,
            content_type="application/latent",
            content=BytesIO(self.samples.data.cpu().numpy()),
            parent_id=self.folder.asset_id if self.folder.is_set() else None,
        )


class UpScaleMethod(str, Enum):
    NEAREST_EXACT = "nearest_exact"
    BILINEAR = "bilinear"
    AREA = "area"
    BICUBIC = "bicubic"
    BISLERP = "bislerp"


class CropMethod(str, Enum):
    DISABLED = "disabled"
    CENTER = "center"


# class LoadLatent(ComfyNode):
#     latent: Latent = Field(description="The latent file to load.")

#     @classmethod
#     def return_type(cls):
#         return {"latent": Latent}


class LatentUpscale(ComfyNode):
    """
    The Upscale Latent node can be used to resize latent images.
    """

    _comfy_class = nodes.LatentUpscale

    samples: Latent = Field(
        default=Latent(), description="The latent samples to upscale."
    )
    upscale_method: UpScaleMethod = Field(
        default=UpScaleMethod.NEAREST_EXACT,
        description="The method to use for upscaling.",
    )
    width: int = Field(
        default=512,
        description="The target width after upscaling.",
        ge=0,
        le=MAX_RESOLUTION,
        multiple_of=8,
    )
    height: int = Field(
        default=512,
        description="The target height after upscaling.",
        ge=0,
        le=MAX_RESOLUTION,
        multiple_of=8,
    )
    crop: CropMethod = Field(
        default=CropMethod.DISABLED, description="The method to use for cropping."
    )

    @classmethod
    def get_title(cls):
        return "Upscale Latent"

    @classmethod
    def return_type(cls):
        return {"latent": Latent}


class LatentUpscaleBy(ComfyNode):
    """
    The Upscale Latent node can be used to resize latent images.
    """

    _comfy_class = nodes.LatentUpscaleBy

    samples: Latent = Field(
        default=Latent(), description="The latent samples to upscale."
    )
    upscale_method: UpScaleMethod = Field(
        default=UpScaleMethod.NEAREST_EXACT,
        description="The method to use for upscaling.",
    )
    scale_by: float = Field(
        default=1.5,
        description="The factor by which to scale.",
        ge=0.01,
        le=8.0,
        multiple_of=0.01,
    )

    @classmethod
    def get_title(cls):
        return "Upscale Latent By"

    @classmethod
    def return_type(cls):
        return {"latent": Latent}


class LatentComposite(ComfyNode):
    """
    The Latent Composite node can be used to paste one latent into another.
    """

    _comfy_class = nodes.LatentComposite

    samples_to: Latent = Field(default=Latent(), description="The first latent sample.")
    samples_from: Latent = Field(
        default=Latent(), description="The second latent sample."
    )
    x: int = Field(default=0, description="The x-coordinate for compositing.")
    y: int = Field(default=0, description="The y-coordinate for compositing.")
    feather: int = Field(
        default=0, description="The feather amount for compositing edges."
    )

    @classmethod
    def return_type(cls):
        return {"latent": Latent}

    @classmethod
    def get_title(cls):
        return "Latent Composite"


class LatentBlend(ComfyNode):
    """
    The Latent Blend node can be used to blend two sets of latent samples. This allows for smooth transitions or combinations of different latent representations.
    """

    _comfy_class = nodes.LatentBlend

    samples1: Latent = Field(
        default=Latent(), description="The first set of latent samples."
    )
    samples2: Latent = Field(
        default=Latent(), description="The second set of latent samples."
    )
    blend_factor: float = Field(
        default=0.5, description="The blend factor between samples."
    )

    @classmethod
    def return_type(cls):
        return {"latent": Latent}

    @classmethod
    def get_title(cls):
        return "Latent Blend"


class LatentFlip(ComfyNode):
    """
    The Flip Latent node can be used to flip latent images.
    """

    _comfy_class = nodes.LatentFlip

    samples: Latent = Field(default=Latent(), description="The latent samples to flip.")
    horizontal: bool = Field(default=False, description="Whether to flip horizontally.")
    vertical: bool = Field(default=False, description="Whether to flip vertically.")

    @classmethod
    def get_title(cls):
        return "Flip Latent"

    @classmethod
    def return_type(cls):
        return {"latent": Latent}


class LatentRotate(ComfyNode):
    """
    The Rotate Latent node can be used to rotate latent images.
    """

    _comfy_class = nodes.LatentRotate

    samples: Latent = Field(
        default=Latent(), description="The latent samples to rotate."
    )
    angle: float = Field(default=0.0, description="The angle to rotate the latent by.")

    @classmethod
    def get_title(cls):
        return "Rotate Latent"

    @classmethod
    def return_type(cls):
        return {"latent": Latent}


class LatentCrop(ComfyNode):
    """
    The Crop Latent node can be used to crop latent images.
    """

    _comfy_class = nodes.LatentCrop

    samples: Latent = Field(default=Latent(), description="The latent samples to crop.")
    x: int = Field(default=0, description="The x-coordinate for cropping.")
    y: int = Field(default=0, description="The y-coordinate for cropping.")
    width: int = Field(default=512, description="The width of the crop.")
    height: int = Field(default=512, description="The height of the crop.")

    @classmethod
    def get_title(cls):
        return "Crop Latent"

    @classmethod
    def return_type(cls):
        return {"latent": Latent}
