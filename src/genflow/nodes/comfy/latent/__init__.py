from enum import Enum
from pydantic import Field
from genflow.metadata.types import VAE, ImageTensor, Latent, Mask
from genflow.nodes.comfy import MAX_RESOLUTION, ComfyNode


class LatentCompositeMasked(ComfyNode):
    destination: Latent = Field(default=Latent(), description="The destination latent.")
    source: Latent = Field(default=Latent(), description="The source latent.")
    x: int = Field(default=0, description="The x position.")
    y: int = Field(default=0, description="The y position.")
    resize_source: bool = Field(
        default=False, description="Whether to resize the source."
    )
    mask: Mask = Field(None, description="The mask to use.")

    @classmethod
    def return_type(cls):
        return {"latent": Latent}


class EmptyLatentImage(ComfyNode):
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


class VAEEncode(ComfyNode):
    pixels: ImageTensor = Field(
        default=ImageTensor(), description="The image to encode."
    )
    vae: VAE = Field(default=VAE(), description="The VAE to use.")

    @classmethod
    def return_type(cls):
        return {"latent": Latent}


class VAEEncodeTiled(ComfyNode):
    pixels: ImageTensor = Field(
        default=ImageTensor(), description="The image pixels to encode."
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
    pixels: ImageTensor = Field(
        default=ImageTensor(), description="The image pixels to encode for inpainting."
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
    samples: Latent = Field(
        default=Latent(), description="The latent samples to decode."
    )
    vae: VAE = Field(default=VAE(), description="The VAE to use.")

    @classmethod
    def return_type(cls):
        return {"image": ImageTensor}


class VAEDecodeTiled(ComfyNode):
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
        return {"image": ImageTensor}


class SaveLatent(ComfyNode):
    samples: Latent = Field(default=Latent(), description="The latent samples to save.")
    filename_prefix: str = Field(
        default="ComfyUI",
        description="The prefix for the filename where the latents will be saved.",
    )

    # prompt: PromptRef = Field(
    #     default=PromptRef(),
    #     description="A hidden input for the prompt information.",
    #     include_in_schema=False,
    # )
    # extra_pnginfo: ExtraPNGInfoRef = Field(
    #     default=ExtraPNGInfoRef(),
    #     description="Additional PNG information to be saved with the latent.",
    #     include_in_schema=False,
    # )j


class UpScaleMethod(str, Enum):
    NEAREST_EXACT = "nearest_exact"
    BILINEAR = "bilinear"
    AREA = "area"
    BICUBIC = "bicubic"
    BISLERP = "bislerp"


class CropMethod(str, Enum):
    DISABLED = "disabled"
    CENTER = "center"


class LoadLatent(ComfyNode):
    latent: Latent = Field(description="The latent file to load.")

    @classmethod
    def return_type(cls):
        return {"latent": Latent}


class LatentUpscale(ComfyNode):
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
    def return_type(cls):
        return {"latent": Latent}


class LatentUpscaleBy(ComfyNode):
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
    def return_type(cls):
        return {"latent": Latent}


class LatentComposite(ComfyNode):
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


class LatentBlend(ComfyNode):
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
