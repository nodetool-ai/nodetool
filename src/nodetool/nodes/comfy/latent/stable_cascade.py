from pydantic import Field
from nodetool.common.comfy_node import ComfyNode, MAX_RESOLUTION
from nodetool.metadata.types import ImageRef, Latent, VAE, Conditioning


class StableCascade_EmptyLatentImage(ComfyNode):
    width: int = Field(
        default=1024,
        ge=256,
        le=MAX_RESOLUTION,
        multiple_of=8,
        description="The width of the latent image.",
    )
    height: int = Field(
        default=1024,
        ge=256,
        le=MAX_RESOLUTION,
        multiple_of=8,
        description="The height of the latent image.",
    )
    compression: int = Field(
        default=42,
        ge=4,
        le=128,
        description="The compression factor for the latent image.",
    )
    batch_size: int = Field(
        default=1, ge=1, le=4096, description="The batch size for the latent images."
    )

    @classmethod
    def get_title(cls):
        return "Stable Cascade Empty Latent Image"

    @classmethod
    def return_type(cls):
        return {"stage_c": Latent, "stage_b": Latent}


class StableCascade_StageC_VAEEncode(ComfyNode):
    image: ImageRef = Field(
        default=ImageRef(), description="The input image to encode."
    )
    vae: VAE = Field(default=VAE(), description="The VAE model to use for encoding.")
    compression: int = Field(
        default=42,
        ge=4,
        le=128,
        description="The compression factor for the latent image.",
    )

    @classmethod
    def get_title(cls):
        return "Stable Cascade Stage C VAE Encode"

    @classmethod
    def return_type(cls):
        return {"stage_c": Latent, "stage_b": Latent}


class StableCascade_StageB_Conditioning(ComfyNode):
    conditioning: Conditioning = Field(
        default=Conditioning(), description="The input conditioning."
    )
    stage_c: Latent = Field(default=Latent(), description="The stage C latent.")

    @classmethod
    def get_title(cls):
        return "Stable Cascade Stage B Conditioning"

    @classmethod
    def return_type(cls):
        return {"conditioning": Conditioning}


class StableCascade_SuperResolutionControlnet(ComfyNode):
    image: ImageRef = Field(
        default=ImageRef(), description="The input image for super-resolution."
    )
    vae: VAE = Field(default=VAE(), description="The VAE model to use for encoding.")

    @classmethod
    def get_title(cls):
        return "Stable Cascade Super Resolution Controlnet"

    @classmethod
    def return_type(cls):
        return {"controlnet_input": ImageRef, "stage_c": Latent, "stage_b": Latent}
