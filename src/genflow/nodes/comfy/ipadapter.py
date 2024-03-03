from enum import Enum

from pydantic import Field, validator

from genflow.metadata.types import (
    CLIPVision,
    Embeds,
    IPAdapter,
    ImageTensor,
    InsightFace,
    Mask,
    UNet,
)
from genflow.nodes.comfy import ComfyNode


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


class InsightFaceLoader(ComfyNode):
    provider: ProviderEnum = Field(default=ProviderEnum.CPU)

    @classmethod
    def return_type(cls):
        return {"insight_face": InsightFace}


class PrepImageForInsightFace(ComfyNode):
    image: ImageTensor = Field(
        default=ImageTensor(), description="The image to prepare."
    )
    crop_position: CropPosition = Field(
        default=CropPosition.CENTER, description="The crop position to use."
    )
    sharpening: float = Field(
        default=0.0, description="The amount of sharpening to apply."
    )
    pad_around: bool = Field(
        default=True, description="Whether to pad around the image."
    )

    @classmethod
    def return_type(cls):
        return {"image": ImageTensor}


class PrepImageForClipVision(ComfyNode):
    image: ImageTensor = Field(
        default=ImageTensor(), description="The image to prepare."
    )
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
        return {"image": ImageTensor}


class IPAdapterModelEnum(str, Enum):
    IP_ADAPTER_FACEID_PLUS_SD15 = "ip-adapter-faceid-plus_sd15.bin"
    IP_ADAPTER_PLUS_SDXL_VIT_H = "ip-adapter-plus_sdxl_vit-h.safetensors"
    IP_ADAPTER_FACEID_PLUSV2_SD15 = "ip-adapter-faceid-plusv2_sd15.bin"
    IP_ADAPTER_FACEID_SD15 = "ip-adapter-faceid_sd15.bin"
    IP_ADAPTER_FULL_FACE_SD15 = "ip-adapter-full-face_sd15.safetensors"
    IP_ADAPTER_SD15_LIGHT = "ip-adapter_sd15_light.safetensors"
    IP_ADAPTER_SD15 = "ip-adapter_sd15.safetensors"
    IP_ADAPTER_SD15_VIT_G = "ip-adapter_sd15_vit-G.safetensors"
    IP_ADAPTER_SDXL = "ip-adapter_sdxl.safetensors"
    IP_ADAPTER_SDXL_VIT_H = "ip-adapter_sdxl_vit-h.safetensors"
    IP_ADAPTER_PLUS_FACE_SD15 = "ip-adapter-plus-face_sd15.safetensors"
    IP_ADAPTER_PLUS_FACE_SDXL_VIT_H = "ip-adapter-plus-face_sdxl_vit-h.safetensors"
    IP_ADAPTER_PLUS_SD15 = "ip-adapter-plus_sd15.safetensors"


class IPAdapterModelLoader(ComfyNode):
    ipadapter_file: IPAdapterModelEnum = Field(
        default=IPAdapterModelEnum.IP_ADAPTER_SD15,
        description="List of available IPAdapter model names.",
    )
    
    @validator("ipadapter_file", pre=True)
    def validate_ipadapter_file(cls, v):
        if isinstance(v, str):
            v = IPAdapterModelEnum(v)
        return v

    @classmethod
    def return_type(cls):
        return {"ipadapter": IPAdapter}


class IPAdapterEncoder(ComfyNode):
    clip_vision: CLIPVision = Field(
        default=CLIPVision(), description="The CLIP vision to use."
    )
    image_1: ImageTensor = Field(
        default=ImageTensor(), description="The first image to encode."
    )
    ipadapter_plus: bool = Field(
        default=False, description="Whether to use IPAdapter+ enhancements."
    )
    noise: float = Field(default=0.0, description="The amount of noise to apply.")
    weight_1: float = Field(default=1.0, description="The weight for the first image.")

    # Optional Inputs
    image_2: ImageTensor | None = Field(
        default=None, description="The second image to encode (optional)."
    )
    image_3: ImageTensor | None = Field(
        default=None, description="The third image to encode (optional)."
    )
    image_4: ImageTensor | None = Field(
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
    image: ImageTensor = Field(default=ImageTensor(), description="The image to use.")
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


class IPAdapterApplyEncoded(IPAdapterApply):
    # Inherits all required and optional fields from IPAdapterApply except for the added "embeds" field
    embeds: Embeds = Field(
        default=Embeds(), description="The encoded embeddings to apply."
    )

    @classmethod
    def return_type(cls):
        return {"unet": UNet}


class IPAdapterApplyFaceID(ComfyNode):
    ipadapter: IPAdapter = Field(default=IPAdapter(), description="The IPAdapter.")
    clip_vision: CLIPVision = Field(
        default=CLIPVision(), description="The CLIP vision."
    )
    insightface: InsightFace = Field(
        default=InsightFace(), description="The InsightFace."
    )
    image: ImageTensor = Field(default=ImageTensor(), description="The image to use.")
    model: UNet = Field(default=UNet(), description="The model to apply the IPAdapter.")
    weight: float = Field(
        default=1.0, description="The weight for processing.", ge=-1, le=3
    )
    noise: float = Field(
        default=0.0, description="The noise level for processing.", ge=0.0, le=1.0
    )
    weight_type: WeightTypeEnum = Field(
        default=WeightTypeEnum.ORIGINAL, description="The weight type to use."
    )
    start_at: float = Field(
        default=0.0,
        description="Start applying from this step (normalized).",
        ge=0.0,
        le=1.0,
    )
    end_at: float = Field(
        default=1.0,
        description="Ends applying at this step (normalized).",
        ge=0.0,
        le=1.0,
    )
    faceid_v2: bool = Field(
        default=False, description="Flag to use faceId v2 algorithm."
    )
    weight_v2: float = Field(
        default=1.0,
        description="The weight for processing with faceId v2.",
        ge=-1,
        le=3,
    )
    unfold_batch: bool = Field(
        default=False, description="Flag to unfold batches for processing."
    )

    attn_mask: Mask | None = Field(default=None, description="The attention mask.")

    @classmethod
    def return_type(cls):
        # Assuming that the return type is an updated image after applying FaceID,
        # if the return type is known and different, that specific type should be used instead.
        return ImageTensor


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
