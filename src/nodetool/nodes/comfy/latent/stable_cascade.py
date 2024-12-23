from pydantic import Field
from nodetool.common.comfy_node import ComfyNode, MAX_RESOLUTION
from nodetool.metadata.types import ImageRef, Latent, VAE, Conditioning
import comfy_extras.nodes_stable_cascade


class StableCascade_EmptyLatentImage(ComfyNode):
    """
    The Stable Cascade Empty Latent Image node can be used to create an empty latent image.
    """

    _comfy_class = comfy_extras.nodes_stable_cascade.StableCascade_EmptyLatentImage

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
    """
    The Stable Cascade Stage C VAE Encode node can be used to encode an image into a latent image.
    """

    _comfy_class = comfy_extras.nodes_stable_cascade.StableCascade_StageC_VAEEncode

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
    """
    The Stable Cascade Stage B Conditioning node can be used to condition the stage B latent image.
    """

    _comfy_class = comfy_extras.nodes_stable_cascade.StableCascade_StageB_Conditioning

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
    """
    The Stable Cascade Super Resolution Controlnet node can be used to encode an image into a latent image.
    """

    _comfy_class = (
        comfy_extras.nodes_stable_cascade.StableCascade_SuperResolutionControlnet
    )

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
