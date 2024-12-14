from enum import Enum

import comfy.utils

from pydantic import Field, validator
from huggingface_hub import try_to_load_from_cache

from nodetool.metadata.types import (
    CLIPVision,
    Embeds,
    HFIPAdapter,
    IPAdapter,
    IPAdapterFile,
    ImageRef,
    Mask,
    UNet,
)
from nodetool.common.comfy_node import ComfyNode
from nodetool.nodes.huggingface.stable_diffusion_base import HF_IP_ADAPTER_MODELS
from nodetool.workflows.processing_context import ProcessingContext


class InterpolationMethod(Enum):
    LANCZOS = "LANCZOS"
    BICUBIC = "BICUBIC"
    HAMMING = "HAMMING"
    BILINEAR = "BILINEAR"
    BOX = "BOX"
    NEAREST = "NEAREST"


class CropPosition(Enum):
    TOP = "top"
    BOTTOM = "bottom"
    LEFT = "left"
    RIGHT = "right"
    CENTER = "center"
    PAD = "pad"


class ProviderEnum(str, Enum):
    CPU = "CPU"
    CUDA = "CUDA"
    ROCM = "ROCM"


class PrepImageForClipVision(ComfyNode):
    image: ImageRef = Field(default=ImageRef(), description="The image to prepare.")
    interpolation: InterpolationMethod = Field(
        default=InterpolationMethod.LANCZOS,
        description="The interpolation method to use.",
    )
    crop_position: CropPosition = Field(
        default=CropPosition.CENTER, description="The crop position to use."
    )
    sharpening: float = Field(
        default=0.0, description="The amount of sharpening to apply."
    )

    @classmethod
    def return_type(cls):
        return {"image": ImageRef}


class IPAdapterEncoder(ComfyNode):
    clip_vision: CLIPVision = Field(
        default=CLIPVision(), description="The CLIP vision to use."
    )
    image_1: ImageRef = Field(
        default=ImageRef(), description="The first image to encode."
    )
    ipadapter_plus: bool = Field(
        default=False, description="Whether to use IPAdapter+ enhancements."
    )
    noise: float = Field(default=0.0, description="The amount of noise to apply.")
    weight_1: float = Field(default=1.0, description="The weight for the first image.")

    # Optional Inputs
    image_2: ImageRef | None = Field(
        default=None, description="The second image to encode (optional)."
    )
    image_3: ImageRef | None = Field(
        default=None, description="The third image to encode (optional)."
    )
    image_4: ImageRef | None = Field(
        default=None, description="The fourth image to encode (optional)."
    )
    weight_2: float = Field(
        default=1.0, description="The weight for the second image (optional)."
    )
    weight_3: float = Field(
        default=1.0, description="The weight for the third image (optional)."
    )
    weight_4: float = Field(
        default=1.0, description="The weight for the fourth image (optional)."
    )

    @classmethod
    def return_type(cls):
        return {"embeds": Embeds}


class WeightTypeEnum(str, Enum):
    ORIGINAL = "original"
    LINEAR = "linear"
    CHANNEL_PENALTY = "channel penalty"


class IPAdapterApply(ComfyNode):
    ipadapter: IPAdapter = Field(
        default=IPAdapter(), description="The IPAdapter to apply."
    )
    clip_vision: CLIPVision = Field(
        default=CLIPVision(), description="The CLIP vision to use."
    )
    image: ImageRef = Field(default=ImageRef(), description="The image to use.")
    model: UNet = Field(
        default=UNet(), description="The model to apply the IPAdapter to."
    )
    weight: float = Field(default=1.0, description="The weight of the application.")
    noise: float = Field(default=0.0, description="The amount of noise to apply.")
    weight_type: WeightTypeEnum = Field(
        default=WeightTypeEnum.ORIGINAL, description="The type of weight to apply."
    )
    start_at: float = Field(
        default=0.0, description="The starting point for applying the IPAdapter."
    )
    end_at: float = Field(
        default=1.0, description="The ending point for applying the IPAdapter."
    )
    unfold_batch: bool = Field(
        default=False, description="Whether to unfold the batch during the application."
    )
    attn_mask: Mask | None = Field(
        default=None, description="The optional attention mask to use (if any)."
    )

    @classmethod
    def return_type(cls):
        return {"unet": UNet}

    async def process(self, context: ProcessingContext):
        (unet,) = await self.call_comfy_node(context)
        name = self.model.name + "_" + self.ipadapter.name
        return {"unet": UNet(name=name, model=unet)}


class IPAdapterApplyEncoded(IPAdapterApply):
    # Inherits all required and optional fields from IPAdapterApply except for the added "embeds" field
    embeds: Embeds = Field(
        default=Embeds(), description="The encoded embeddings to apply."
    )

    @classmethod
    def return_type(cls):
        return {"unet": UNet}


class IPAdapterSaveEmbeds(ComfyNode):
    embeds: Embeds = Field(default=Embeds(), description="The embeddings to save.")
    filename_prefix: str = Field(
        default="embeds/IPAdapter",
        description="The prefix for the filename to save the embeddings.",
    )


# class IPAdapterLoadEmbeds(ComfyNode):
#     node_type: Literal["ipadapter_load_embeds"] = "ipadapter_load_embeds"
#     # Assuming the use of a function or variable similar to 'files' to dynamically generate file choices
#     embeds_file: Filename = Field(
#         default=ComputedFilename(), description="The embeddings file to load."
#     )

#     @classmethod
#     def return_type(cls):
#         return {"embeds": Embeds}


class IPAdapterBatchEmbeds(ComfyNode):
    embed1: Embeds = Field(default=Embeds(), description="The first set of embeddings.")
    embed2: Embeds = Field(
        default=Embeds(), description="The second set of embeddings."
    )

    @classmethod
    def return_type(cls):
        return {"embeds": Embeds}
