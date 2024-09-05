from enum import Enum
import numpy as np
import PIL.Image
from nodetool.metadata.types import (
    BoundingBox,
    HFControlNet,
    HFIPAdapter,
    HFImageClassification,
    HFImageToImage,
    HFLora,
    HFStableDiffusion,
    HFStableDiffusionXL,
    HFStableDiffusionXLTurbo,
    HFZeroShotImageClassification,
    HFDepthEstimation,
    HFImageSegmentation,
    HFObjectDetection,
    HFZeroShotObjectDetection,
    HuggingFaceModel,
    ImageRef,
    ImageSegmentationResult,
    ObjectDetectionResult,
)
from nodetool.nodes.huggingface.huggingface_pipeline import HuggingFacePipelineNode
from nodetool.providers.huggingface.huggingface_node import progress_callback
from nodetool.workflows.processing_context import ProcessingContext
from pydantic import Field
from typing import Any
import asyncio
from nodetool.workflows.base_node import BaseNode
from nodetool.metadata.types import ImageRef
from nodetool.workflows.types import NodeProgress
import torch
from diffusers import AutoPipelineForText2Image, AutoPipelineForImage2Image  # type: ignore
from diffusers import StableDiffusionXLControlNetPipeline, ControlNetModel, AutoencoderKL  # type: ignore
from diffusers import StableDiffusionPipeline, StableDiffusionImg2ImgPipeline  # type: ignore
from diffusers import StableDiffusionInpaintPipeline  # type: ignore
from diffusers import StableDiffusionXLPipeline, StableDiffusionXLImg2ImgPipeline  # type: ignore
from diffusers import PixArtAlphaPipeline  # type: ignore
from diffusers import PixArtSigmaPipeline  # type: ignore
from diffusers.schedulers import (
    DPMSolverSDEScheduler,  # type: ignore
    EulerDiscreteScheduler,  # type: ignore
    LMSDiscreteScheduler,  # type: ignore
    DDIMScheduler,  # type: ignore
    DDPMScheduler,  # type: ignore
    HeunDiscreteScheduler,  # type: ignore
    DPMSolverMultistepScheduler,  # type: ignore
    DEISMultistepScheduler,  # type: ignore
    PNDMScheduler,  # type: ignore
    EulerAncestralDiscreteScheduler,  # type: ignore
    UniPCMultistepScheduler,  # type: ignore
    KDPM2DiscreteScheduler,  # type: ignore
    DPMSolverSinglestepScheduler,  # type: ignore
    KDPM2AncestralDiscreteScheduler,  # type: ignore
)
from diffusers import AutoPipelineForInpainting  # type: ignore
from diffusers import StableDiffusionControlNetPipeline, ControlNetModel  # type: ignore
from diffusers import StableDiffusionControlNetInpaintPipeline  # type: ignore
from diffusers import StableDiffusionControlNetImg2ImgPipeline  # type: ignore
from diffusers import StableDiffusionUpscalePipeline  # type: ignore
from diffusers import UNet2DConditionModel  # type: ignore
from diffusers import DiffusionPipeline  # type: ignore
from diffusers import LCMScheduler  # type: ignore
import PIL.Image
import PIL.ImageDraw
import PIL.ImageFont


class IPAdapter_SDXL_Model(str, Enum):
    NONE = ""
    IP_ADAPTER = "ip-adapter_sdxl.safetensors"
    IP_ADAPTER_PLUS = "ip-adapter-plus_sdxl_vit-h.safetensors"


class IPAdapter_SD15_Model(str, Enum):
    NONE = ""
    IP_ADAPTER = "ip-adapter_sd15.safetensors"
    IP_ADAPTER_LIGHT = "ip-adapter_sd15_light.safetensors"
    IP_ADAPTER_PLUS = "ip-adapter-plus_sd15.bin"
    IP_ADAPTER_PLUS_FACE = "ip-adapter-plus-face_sd15.safetensors"
    IP_ADAPTER_FULL_FACE = "ip-adapter-full-face_sd15.safetensors"


class LORA_Model(str, Enum):
    NONE = ""
    ADD_DETAIL = "add_detail"
    _2D_sprite = "2d_sprite"
    GHIBLI_SCENERY = "ghibli_scenery"
    COLORWATER = "colorwater"
    SXZ_GAME_ASSETS = "sxz_game_assets"
    _3DANAGLYPH = "3Danaglyph"
    AKIRATORIYAMA_STYLE = "akiratoriyama_style"
    ANIMEOUTLINEV4 = "animeoutlineV4"
    AQUA_KONOSUBA = "aqua_konosuba"
    ARAKIHIROHIKO_STYLE = "arakihirohiko_style"
    ARCANE_STYLE = "arcane_style"
    CANETAAZUL = "canetaazul"
    CYBERPUNK_TAROT = "cyberpunk_tarot"
    DISCOELYSIUM_STYLE = "discoelysium_style"
    ESDEATH_AKAMEGAKILL = "esdeath_akamegakill"
    FIRE_VFX = "fire_vfx"
    FLAMINGEYE = "flamingeye"
    FUNNYCREATURES = "funnycreatures"
    GACHA_SPLASH = "gacha_splash"
    GIGACHAD = "gigachad"
    GYOKAI_STYLE = "gyokai_style"
    HAROLD = "harold"
    HIDEROHORIBES_STYLE = "hiderohoribes_style"
    ILYAKUVSHINOV_STYLE = "ilyakuvshinov_style"
    JACKSPARROW = "jacksparrow"
    JIMLEE_STYLE = "jimlee_style"
    KOMOWATAHARUKA_CHIBIART = "komowataharuka_chibiart"
    LIGHTNING_VFX = "lightning_vfx"
    LUCY_CYBERPUNK = "lucy_cyberpunk"
    LUISAP_PIXELART = "luisap_pixelart"
    MUMEI_KABANERI = "mumei_kabaneri"
    MYHEROACADEMIA_STYLE = "myheroacademia_style"
    NEOARTCORE = "neoartcore"
    OCHAKOURARAKA = "ochakouraraka"
    ONEPIECE_STYLE = "onepiece_style"
    PAIMON_GENSHINIMPACT = "paimon_genshinimpact"
    PEANUTSCOMICS_STYLE = "peanutscomics_style"
    PEPEFROG = "pepefrog"
    PERSONA5_PORTRAITS = "persona5_portraits"
    PERSONA5_STYLE = "persona5_style"
    PIXHELL = "pixhell"
    PRINCESSZELDA = "princesszelda"
    SATOSHIURUCHIHARA_STYLE = "satoshiuruchihara_style"
    SHINOBU_DEMONSLAYER = "shinobu_demonslayer"
    SOKOLOV_STYLE = "sokolov_style"
    STANDINGBACKGROUNDV1 = "standingbackgroundv1"
    SUN_SHADOW_STYLE = "sun_shadow_style"
    THICKERANIMELINES = "thickeranimelines"
    THREESIDEDVIEW = "threesidedview"
    TWITCH_EMOTES = "twitch_emotes"
    WATER_VFX = "water_vfx"
    WLOP_STYLE = "wlop_style"
    ZEROTWO_DARLING = "zerotwo_darling"


class LORA_SDXL_Model(str, Enum):
    NONE = ""
    TOY_FACE = "toy-face"
    PIXEL_ART = "pixel-art"
    _3D_RENDER_STYLE = "3d-render-style"
    CUTE_CARTOON = "cute-cartoon"
    GRAPHIC_NOVEL_ILLUSTRATION = "graphic-novel-illustration"
    COLORING_BOOK = "coloring-book"
    ANIME_DETAILER_XL = "anime-detailer-xl"


LORA_WEIGHTS = {
    LORA_Model._2D_sprite: {
        "repo": "danbrown/loras",
        "weight_name": "2d_sprite.safetensors",
    },
    LORA_Model.GHIBLI_SCENERY: {
        "repo": "danbrown/loras",
        "weight_name": "ghibli_scenery.safetensors",
    },
    LORA_Model.ADD_DETAIL: {
        "repo": "danbrown/loras",
        "weight_name": "add_detail.safetensors",
    },
    LORA_Model.COLORWATER: {
        "repo": "danbrown/loras",
        "weight_name": "colorwater.safetensors",
    },
    LORA_Model.SXZ_GAME_ASSETS: {
        "repo": "danbrown/loras",
        "weight_name": "sxz_game_assets.safetensors",
    },
    LORA_Model._3DANAGLYPH: {
        "repo": "danbrown/loras",
        "weight_name": "3Danaglyph.safetensors",
    },
    LORA_Model.AKIRATORIYAMA_STYLE: {
        "repo": "danbrown/loras",
        "weight_name": "akiratoriyama_style.safetensors",
    },
    LORA_Model.ANIMEOUTLINEV4: {
        "repo": "danbrown/loras",
        "weight_name": "animeoutlineV4.safetensors",
    },
    LORA_Model.AQUA_KONOSUBA: {
        "repo": "danbrown/loras",
        "weight_name": "aqua_konosuba.safetensors",
    },
    LORA_Model.ARAKIHIROHIKO_STYLE: {
        "repo": "danbrown/loras",
        "weight_name": "arakihirohiko_style.safetensors",
    },
    LORA_Model.ARCANE_STYLE: {
        "repo": "danbrown/loras",
        "weight_name": "arcane_style.safetensors",
    },
    LORA_Model.CANETAAZUL: {
        "repo": "danbrown/loras",
        "weight_name": "canetaazul.safetensors",
    },
    LORA_Model.CYBERPUNK_TAROT: {
        "repo": "danbrown/loras",
        "weight_name": "cyberpunk_tarot.safetensors",
    },
    LORA_Model.DISCOELYSIUM_STYLE: {
        "repo": "danbrown/loras",
        "weight_name": "discoelysium_style.safetensors",
    },
    LORA_Model.ESDEATH_AKAMEGAKILL: {
        "repo": "danbrown/loras",
        "weight_name": "esdeath_akamegakill.safetensors",
    },
    LORA_Model.FIRE_VFX: {
        "repo": "danbrown/loras",
        "weight_name": "fire_vfx.safetensors",
    },
    LORA_Model.FLAMINGEYE: {
        "repo": "danbrown/loras",
        "weight_name": "flamingeye.safetensors",
    },
    LORA_Model.FUNNYCREATURES: {
        "repo": "danbrown/loras",
        "weight_name": "funnycreatures.safetensors",
    },
    LORA_Model.GACHA_SPLASH: {
        "repo": "danbrown/loras",
        "weight_name": "gacha_splash.safetensors",
    },
    LORA_Model.GIGACHAD: {
        "repo": "danbrown/loras",
        "weight_name": "gigachad.safetensors",
    },
    LORA_Model.GYOKAI_STYLE: {
        "repo": "danbrown/loras",
        "weight_name": "gyokai_style.safetensors",
    },
    LORA_Model.HAROLD: {
        "repo": "danbrown/loras",
        "weight_name": "harold.safetensors",
    },
    LORA_Model.HIDEROHORIBES_STYLE: {
        "repo": "danbrown/loras",
        "weight_name": "hiderohoribes_style.safetensors",
    },
    LORA_Model.ILYAKUVSHINOV_STYLE: {
        "repo": "danbrown/loras",
        "weight_name": "ilyakuvshinov_style.safetensors",
    },
    LORA_Model.JACKSPARROW: {
        "repo": "danbrown/loras",
        "weight_name": "jacksparrow.safetensors",
    },
    LORA_Model.JIMLEE_STYLE: {
        "repo": "danbrown/loras",
        "weight_name": "jimlee_style.safetensors",
    },
    LORA_Model.KOMOWATAHARUKA_CHIBIART: {
        "repo": "danbrown/loras",
        "weight_name": "komowataharuka_chibiart.safetensors",
    },
    LORA_Model.LIGHTNING_VFX: {
        "repo": "danbrown/loras",
        "weight_name": "lightning_vfx.safetensors",
    },
    LORA_Model.LUCY_CYBERPUNK: {
        "repo": "danbrown/loras",
        "weight_name": "lucy_cyberpunk.safetensors",
    },
    LORA_Model.LUISAP_PIXELART: {
        "repo": "danbrown/loras",
        "weight_name": "luisap_pixelart.safetensors",
    },
    LORA_Model.MUMEI_KABANERI: {
        "repo": "danbrown/loras",
        "weight_name": "mumei_kabaneri.safetensors",
    },
    LORA_Model.MYHEROACADEMIA_STYLE: {
        "repo": "danbrown/loras",
        "weight_name": "myheroacademia_style.safetensors",
    },
    LORA_Model.NEOARTCORE: {
        "repo": "danbrown/loras",
        "weight_name": "neoartcore.safetensors",
    },
    LORA_Model.OCHAKOURARAKA: {
        "repo": "danbrown/loras",
        "weight_name": "ochakouraraka.safetensors",
    },
    LORA_Model.ONEPIECE_STYLE: {
        "repo": "danbrown/loras",
        "weight_name": "onepiece_style.safetensors",
    },
    LORA_Model.PAIMON_GENSHINIMPACT: {
        "repo": "danbrown/loras",
        "weight_name": "paimon_genshinimpact.safetensors",
    },
    LORA_Model.PEANUTSCOMICS_STYLE: {
        "repo": "danbrown/loras",
        "weight_name": "peanutscomics_style.safetensors",
    },
    LORA_Model.PEPEFROG: {
        "repo": "danbrown/loras",
        "weight_name": "pepefrog.safetensors",
    },
    LORA_Model.PERSONA5_PORTRAITS: {
        "repo": "danbrown/loras",
        "weight_name": "persona5_portraits.safetensors",
    },
    LORA_Model.PERSONA5_STYLE: {
        "repo": "danbrown/loras",
        "weight_name": "persona5_style.safetensors",
    },
    LORA_Model.PIXHELL: {
        "repo": "danbrown/loras",
        "weight_name": "pixhell.safetensors",
    },
    LORA_Model.PRINCESSZELDA: {
        "repo": "danbrown/loras",
        "weight_name": "princesszelda.safetensors",
    },
    LORA_Model.SATOSHIURUCHIHARA_STYLE: {
        "repo": "danbrown/loras",
        "weight_name": "satoshiuruchihara_style.safetensors",
    },
    LORA_Model.SHINOBU_DEMONSLAYER: {
        "repo": "danbrown/loras",
        "weight_name": "shinobu_demonslayer.safetensors",
    },
    LORA_Model.SOKOLOV_STYLE: {
        "repo": "danbrown/loras",
        "weight_name": "sokolov_style.safetensors",
    },
    LORA_Model.STANDINGBACKGROUNDV1: {
        "repo": "danbrown/loras",
        "weight_name": "standingbackgroundv1.safetensors",
    },
    LORA_Model.SUN_SHADOW_STYLE: {
        "repo": "danbrown/loras",
        "weight_name": "sun_shadow_style.safetensors",
    },
    LORA_Model.THICKERANIMELINES: {
        "repo": "danbrown/loras",
        "weight_name": "thickeranimelines.safetensors",
    },
    LORA_Model.THREESIDEDVIEW: {
        "repo": "danbrown/loras",
        "weight_name": "threesidedview.safetensors",
    },
    LORA_Model.TWITCH_EMOTES: {
        "repo": "danbrown/loras",
        "weight_name": "twitch_emotes.safetensors",
    },
    LORA_Model.WATER_VFX: {
        "repo": "danbrown/loras",
        "weight_name": "water_vfx.safetensors",
    },
    LORA_Model.WLOP_STYLE: {
        "repo": "danbrown/loras",
        "weight_name": "wlop_style.safetensors",
    },
    LORA_Model.ZEROTWO_DARLING: {
        "repo": "danbrown/loras",
        "weight_name": "zerotwo_darling.safetensors",
    },
    LORA_Model._2D_sprite: {
        "repo": "danbrown/loras",
        "weight_name": "2d_sprite.safetensors",
    },
    LORA_Model.GHIBLI_SCENERY: {
        "repo": "danbrown/loras",
        "weight_name": "ghibli_scenery.safetensors",
    },
    LORA_Model.ADD_DETAIL: {
        "repo": "danbrown/loras",
        "weight_name": "add_detail.safetensors",
    },
    LORA_Model.COLORWATER: {
        "repo": "danbrown/loras",
        "weight_name": "colorwater.safetensors",
    },
    LORA_Model.SXZ_GAME_ASSETS: {
        "repo": "danbrown/loras",
        "weight_name": "sxz_game_assets.safetensors",
    },
    LORA_SDXL_Model.TOY_FACE: {
        "repo": "CiroN2022/toy-face",
        "weight_name": "toy_face_sdxl.safetensors",
    },
    LORA_SDXL_Model.PIXEL_ART: {
        "repo": "nerijs/pixel-art-xl",
        "weight_name": "pixel-art-xl.safetensors",
    },
    LORA_SDXL_Model._3D_RENDER_STYLE: {
        "repo": "goofyai/3d_render_style_xl",
        "weight_name": "3d_render_style_xl.safetensors",
    },
    LORA_SDXL_Model.CUTE_CARTOON: {
        "repo": "artificialguybr/CuteCartoonRedmond-V2",
        "weight_name": "CuteCartoonRedmond-CuteCartoon-CuteCartoonAF.safetensors",
    },
    LORA_SDXL_Model.GRAPHIC_NOVEL_ILLUSTRATION: {
        "repo": "blink7630/graphic-novel-illustration",
        "weight_name": "Graphic_Novel_Illustration-000007.safetensors",
    },
    LORA_SDXL_Model.COLORING_BOOK: {
        "repo": "robert123231/coloringbookgenerator",
        "weight_name": "ColoringBookRedmond-ColoringBook-ColoringBookAF.safetensors",
    },
    LORA_SDXL_Model.ANIME_DETAILER_XL: {
        "repo": "Linaqruf/anime-detailer-xl-lora",
        "weight_name": "anime-detailer-xl-lora.safetensors",
    },
}


class ImageClassifier(HuggingFacePipelineNode):
    """
    Classifies images into predefined categories.
    image, classification, labeling, categorization

    Use cases:
    - Content moderation by detecting inappropriate images
    - Organizing photo libraries by automatically tagging images
    """

    model: HFImageClassification = Field(
        default=HFImageClassification(),
        title="Model ID on Huggingface",
        description="The model ID to use for the classification",
    )
    inputs: ImageRef = Field(
        default=ImageRef(),
        title="Image",
        description="The input image to classify",
    )

    @classmethod
    def get_recommended_models(cls) -> list[HFImageClassification]:
        return [
            HFImageClassification(
                repo_id="google/vit-base-patch16-224",
                allow_patterns=["*.safetensors", "*.json", "**/*.json"],
            ),
            HFImageClassification(
                repo_id="microsoft/resnet-50",
                allow_patterns=["*.safetensors", "*.json", "**/*.json"],
            ),
            HFImageClassification(
                repo_id="microsoft/resnet-18",
                allow_patterns=["*.safetensors", "*.json", "**/*.json"],
            ),
            HFImageClassification(
                repo_id="apple/mobilevit-small",
                allow_patterns=["*.bin", "*.json", "**/*.json"],
            ),
            HFImageClassification(
                repo_id="apple/mobilevit-xx-small",
                allow_patterns=["*.bin", "*.json", "**/*.json"],
            ),
            HFImageClassification(
                repo_id="nateraw/vit-age-classifier",
                allow_patterns=["*.safetensors", "*.json", "**/*.json"],
            ),
            HFImageClassification(
                repo_id="Falconsai/nsfw_image_detection",
                allow_patterns=["*.safetensors", "*.json", "**/*.json"],
            ),
            HFImageClassification(
                repo_id="rizvandwiki/gender-classification-2",
                allow_patterns=["*.safetensors", "*.json", "**/*.json"],
            ),
        ]

    def required_inputs(self):
        return ["inputs"]

    def get_model_id(self):
        return self.model.repo_id

    @classmethod
    def get_title(cls) -> str:
        return "Image Classifier"

    @property
    def pipeline_task(self) -> str:
        return "image-classification"

    async def get_inputs(self, context: ProcessingContext):
        return await context.image_to_pil(self.inputs)

    async def process_remote_result(
        self, context: ProcessingContext, result: Any
    ) -> dict[str, float]:
        return {item["label"]: item["score"] for item in result}

    async def process_local_result(
        self, context: ProcessingContext, result: Any
    ) -> dict[str, float]:
        return {item["label"]: item["score"] for item in result}

    async def process(self, context: ProcessingContext) -> dict[str, float]:
        return await super().process(context)


class ZeroShotImageClassifier(HuggingFacePipelineNode):
    """
    Classifies images into categories without the need for training data.
    image, classification, labeling, categorization

    Use cases:
    - Quickly categorize images without training data
    - Identify objects in images without predefined labels
    - Automate image tagging for large datasets

    Recommended models:
    - openai/clip-vit-large-patch14
    - openai/clip-vit-base-patch16
    - openai/clip-vit-base-patch32
    - patrickjohncyh/fashion-clip
    - laion/CLIP-ViT-H-14-laion2B-s32B-b79K
    """

    model: HFZeroShotImageClassification = Field(
        default=HFZeroShotImageClassification(),
        title="Model ID on Huggingface",
        description="The model ID to use for the classification",
    )
    inputs: ImageRef = Field(
        default=ImageRef(),
        title="Image",
        description="The input image to classify",
    )
    candidate_labels: str = Field(
        default="",
        title="Candidate Labels",
        description="The candidate labels to classify the image against, separated by commas",
    )

    @classmethod
    def get_recommended_models(cls) -> list[HFZeroShotImageClassification]:
        return [
            HFZeroShotImageClassification(
                repo_id="openai/clip-vit-base-patch16",
                allow_patterns=["pytorch_model.bin", "*.json", "*.txt"],
            ),
            HFZeroShotImageClassification(
                repo_id="openai/clip-vit-base-patch32",
                allow_patterns=["pytorch_model.bin", "*.json", "*.txt"],
            ),
            HFZeroShotImageClassification(
                repo_id="openai/clip-vit-base-patch14",
                allow_patterns=["pytorch_model.bin", "*.json", "*.txt"],
            ),
            HFZeroShotImageClassification(
                repo_id="patricjohncyh/fashion-clip",
                allow_patterns=["pytorch_model.bin", "*.json", "*.txt"],
            ),
            HFZeroShotImageClassification(
                repo_id="laion/CLIP-ViT-H-14-laion2B-s32B-b79K",
                allow_patterns=["pytorch_model.bin", "*.json", "*.txt"],
            ),
            HFZeroShotImageClassification(
                repo_id="laion/CLIP-ViT-g-14-laion2B-s12B-b42K",
                allow_patterns=["pytorch_model.bin", "*.json", "*.txt"],
            ),
        ]

    def required_inputs(self):
        return ["inputs"]

    @classmethod
    def get_title(cls) -> str:
        return "Zero-Shot Image Classifier"

    def get_model_id(self):
        return self.model.repo_id

    @property
    def pipeline_task(self) -> str:
        return "zero-shot-image-classification"

    def get_params(self):
        return {
            "candidate_labels": self.candidate_labels.split(","),
        }

    async def get_inputs(self, context: ProcessingContext):
        return await context.image_to_pil(self.inputs)

    async def process_remote_result(
        self, context: ProcessingContext, result: Any
    ) -> dict[str, float]:
        return {item["label"]: item["score"] for item in result}

    async def process_local_result(
        self, context: ProcessingContext, result: Any
    ) -> dict[str, float]:
        return {item["label"]: item["score"] for item in result}

    async def process(self, context: ProcessingContext) -> dict[str, float]:
        return await super().process(context)


class StableDiffusionScheduler(str, Enum):
    DPMSolverSDEScheduler = "DPMSolverSDEScheduler"
    EulerDiscreteScheduler = "EulerDiscreteScheduler"
    LMSDiscreteScheduler = "LMSDiscreteScheduler"
    DDIMScheduler = "DDIMScheduler"
    DDPMScheduler = "DDPMScheduler"
    HeunDiscreteScheduler = "HeunDiscreteScheduler"
    DPMSolverMultistepScheduler = "DPMSolverMultistepScheduler"
    DEISMultistepScheduler = "DEISMultistepScheduler"
    PNDMScheduler = "PNDMScheduler"
    EulerAncestralDiscreteScheduler = "EulerAncestralDiscreteScheduler"
    UniPCMultistepScheduler = "UniPCMultistepScheduler"
    KDPM2DiscreteScheduler = "KDPM2DiscreteScheduler"
    DPMSolverSinglestepScheduler = "DPMSolverSinglestepScheduler"
    KDPM2AncestralDiscreteScheduler = "KDPM2AncestralDiscreteScheduler"


def get_scheduler_class(scheduler: StableDiffusionScheduler):
    if scheduler == StableDiffusionScheduler.DPMSolverSDEScheduler:
        return DPMSolverSDEScheduler
    elif scheduler == StableDiffusionScheduler.EulerDiscreteScheduler:
        return EulerDiscreteScheduler
    elif scheduler == StableDiffusionScheduler.LMSDiscreteScheduler:
        return LMSDiscreteScheduler
    elif scheduler == StableDiffusionScheduler.DDIMScheduler:
        return DDIMScheduler
    elif scheduler == StableDiffusionScheduler.DDPMScheduler:
        return DDPMScheduler
    elif scheduler == StableDiffusionScheduler.HeunDiscreteScheduler:
        return HeunDiscreteScheduler
    elif scheduler == StableDiffusionScheduler.DPMSolverMultistepScheduler:
        return DPMSolverMultistepScheduler
    elif scheduler == StableDiffusionScheduler.DEISMultistepScheduler:
        return DEISMultistepScheduler
    elif scheduler == StableDiffusionScheduler.PNDMScheduler:
        return PNDMScheduler
    elif scheduler == StableDiffusionScheduler.EulerAncestralDiscreteScheduler:
        return EulerAncestralDiscreteScheduler
    elif scheduler == StableDiffusionScheduler.UniPCMultistepScheduler:
        return UniPCMultistepScheduler
    elif scheduler == StableDiffusionScheduler.KDPM2DiscreteScheduler:
        return KDPM2DiscreteScheduler
    elif scheduler == StableDiffusionScheduler.DPMSolverSinglestepScheduler:
        return DPMSolverSinglestepScheduler
    elif scheduler == StableDiffusionScheduler.KDPM2AncestralDiscreteScheduler:
        return KDPM2AncestralDiscreteScheduler
    else:
        raise ValueError(f"Invalid scheduler: {scheduler}")


class VisualizeSegmentation(BaseNode):
    """
    Visualizes segmentation masks on images with labels.
    image, segmentation, visualization

    Use cases:
    - Visualize results of image segmentation models
    - Analyze and compare different segmentation techniques
    - Create labeled images for presentations or reports
    """

    image: ImageRef = Field(
        default=ImageRef(),
        title="Image",
        description="The input image to visualize",
    )

    segments: list[ImageSegmentationResult] = Field(
        default=[],
        title="Segmentation Masks",
        description="The segmentation masks to visualize",
    )

    def required_inputs(self):
        return ["image"]

    @classmethod
    def get_title(cls) -> str:
        return "Visualize Segmentation"

    async def process(self, context: ProcessingContext) -> ImageRef:
        image = await context.image_to_pil(self.image)
        image = image.convert("RGB")
        draw = PIL.ImageDraw.Draw(image)

        # Create a color map
        color_map = self.generate_color_map(len(self.segments))

        for i, segment in enumerate(self.segments):
            segment_mask = await context.image_to_pil(segment.mask)
            segment_mask = segment_mask.convert("L")
            color = color_map[i % len(color_map)]

            # Create a colored mask
            colored_mask = PIL.Image.new("RGBA", image.size, (0, 0, 0, 0))
            colored_mask_draw = PIL.ImageDraw.Draw(colored_mask)
            colored_mask_draw.bitmap((0, 0), segment_mask, fill=(*color, 128))

            # Blend the colored mask with the original image
            image = PIL.Image.alpha_composite(
                image.convert("RGBA"), colored_mask
            ).convert("RGB")

            # Find the centroid of the mask to place the label
            mask_array = np.array(segment_mask)
            y_indices, x_indices = np.where(mask_array > 0)
            if len(x_indices) > 0 and len(y_indices) > 0:
                centroid_x = int(np.mean(x_indices))
                centroid_y = int(np.mean(y_indices))

                # Draw the label
                draw = PIL.ImageDraw.Draw(image)
                font = PIL.ImageFont.load_default(16)
                label = segment.label
                text_bbox = draw.textbbox((centroid_x, centroid_y), label, font=font)
                draw.rectangle(text_bbox, fill="white")
                draw.text((centroid_x, centroid_y), label, fill=tuple(color), font=font)

        return await context.image_from_pil(image)

    def generate_color_map(self, num_colors):
        """Generate a list of distinct colors."""
        colors = []
        for i in range(num_colors):
            r = int((i * 67) % 256)
            g = int((i * 111) % 256)
            b = int((i * 193) % 256)
            colors.append((r, g, b))
        return colors


class Segmentation(HuggingFacePipelineNode):
    """
    Performs semantic segmentation on images, identifying and labeling different regions.
    image, segmentation, object detection, scene parsing

    Use cases:
    - Segmenting objects in images
    - Segmenting facial features in images

    Recommended models:
    - nvidia/segformer-b3-finetuned-ade-512-512
    - mattmdjaga/segformer_b2_clothes
    """

    model: HFImageSegmentation = Field(
        default=HFImageSegmentation(
            repo_id="nvidia/segformer-b3-finetuned-ade-512-512"
        ),
        title="Model ID on Huggingface",
        description="The model ID to use for the segmentation",
    )
    image: ImageRef = Field(
        default=ImageRef(),
        title="Image",
        description="The input image to segment",
    )

    @classmethod
    def get_recommended_models(cls) -> list[HFImageSegmentation]:
        return [
            HFImageSegmentation(
                repo_id="nvidia/segformer-b3-finetuned-ade-512-512",
                allow_patterns=["*.bin", "*.json", "**/*.json"],
            ),
            HFImageSegmentation(
                repo_id="mattmdjaga/segformer_b2_clothes",
                allow_patterns=["*.bin", "*.json", "**/*.json"],
            ),
        ]

    def required_inputs(self):
        return ["image"]

    def get_model_id(self):
        return self.model.repo_id

    @property
    def pipeline_task(self) -> str:
        return "image-segmentation"

    async def get_inputs(self, context: ProcessingContext):
        return await context.image_to_pil(self.image)

    async def process_local_result(
        self, context: ProcessingContext, result: Any
    ) -> list[ImageSegmentationResult]:
        async def convert_output(item: dict[str, Any]):
            mask = await context.image_from_pil(item["mask"])
            return ImageSegmentationResult(mask=mask, label=item["label"])

        return await asyncio.gather(*[convert_output(item) for item in result])

    async def process(
        self, context: ProcessingContext
    ) -> list[ImageSegmentationResult]:
        return await super().process(context)


class FindSegment(BaseNode):
    """
    Extracts a specific segment from a list of segmentation masks.
    """

    segments: list[ImageSegmentationResult] = Field(
        default={},
        title="Segmentation Masks",
        description="The segmentation masks to search",
    )

    segment_label: str = Field(
        default="",
        title="Label",
        description="The label of the segment to extract",
    )

    def required_inputs(self):
        return ["segments"]

    @classmethod
    def get_title(cls) -> str:
        return "Find Segment"

    async def process(self, context: ProcessingContext) -> ImageRef:
        for segment in self.segments:
            if segment.label == self.segment_label:
                return segment.mask
        raise ValueError(f"Segment not found: {self.segment_label}")


class ObjectDetection(HuggingFacePipelineNode):
    """
    Detects and localizes objects in images.
    image, object detection, bounding boxes, huggingface

    Use cases:
    - Identify and count objects in images
    - Locate specific items in complex scenes
    - Assist in autonomous vehicle vision systems
    - Enhance security camera footage analysis

    Recommended models:
    - facebook/detr-resnet-50
    """

    model: HFObjectDetection = Field(
        default=HFObjectDetection(repo_id="facebook/detr-resnet-50"),
        title="Model ID on Huggingface",
        description="The model ID to use for object detection",
    )
    inputs: ImageRef = Field(
        default=ImageRef(),
        title="Inputs",
        description="The input image for object detection",
    )
    threshold: float = Field(
        default=0.9,
        title="Confidence Threshold",
        description="Minimum confidence score for detected objects",
    )
    top_k: int = Field(
        default=5,
        title="Top K",
        description="The number of top predictions to return",
    )

    @classmethod
    def get_recommended_models(cls) -> list[HFObjectDetection]:
        return [
            HFObjectDetection(
                repo_id="facebook/detr-resnet-50",
                allow_patterns=["*.bin", "*.json", "**/*.json"],
            ),
            HFObjectDetection(
                repo_id="facebook/detr-resnet-101",
                allow_patterns=["*.safetensors", "*.json", "**/*.json"],
            ),
            HFObjectDetection(
                repo_id="hustvl/yolos-tiny",
                allow_patterns=["*.safetensors", "*.json", "**/*.json"],
            ),
            HFObjectDetection(
                repo_id="hustvl/yolos-small",
                allow_patterns=["*.safetensors", "*.json", "**/*.json"],
            ),
            HFObjectDetection(
                repo_id="microsoft/table-transformer-detection",
                allow_patterns=["*.bin", "*.json", "**/*.json"],
            ),
            HFObjectDetection(
                repo_id="microsoft/table-transformer-structure-recognition-v1.1-all",
                allow_patterns=["*.bin", "*.json", "**/*.json"],
            ),
            HFObjectDetection(
                repo_id="valentinafeve/yolos-fashionpedia",
                allow_patterns=["*.bin", "*.json", "**/*.json"],
            ),
        ]

    def required_inputs(self):
        return ["inputs"]

    @classmethod
    def get_title(cls) -> str:
        return "Object Detection"

    def get_model_id(self):
        return self.model.repo_id

    @property
    def pipeline_task(self) -> str:
        return "object-detection"

    async def get_inputs(self, context: ProcessingContext):
        return await context.image_to_pil(self.inputs)

    def get_params(self):
        return {
            "threshold": self.threshold,
        }

    async def process_local_result(
        self, context: ProcessingContext, result: Any
    ) -> list[ObjectDetectionResult]:
        return [
            ObjectDetectionResult(
                label=item["label"],
                score=item["score"],
                box=BoundingBox(
                    xmin=item["box"]["xmin"],
                    ymin=item["box"]["ymin"],
                    xmax=item["box"]["xmax"],
                    ymax=item["box"]["ymax"],
                ),
            )
            for item in result
        ]

    async def process(self, context: ProcessingContext) -> list[ObjectDetectionResult]:
        return await super().process(context)


class VisualizeObjectDetection(BaseNode):
    """
    Visualizes object detection results on images.
    """

    image: ImageRef = Field(
        default=ImageRef(),
        title="Image",
        description="The input image to visualize",
    )

    objects: list[ObjectDetectionResult] = Field(
        default={},
        title="Detected Objects",
        description="The detected objects to visualize",
    )

    def required_inputs(self):
        return ["image", "objects"]

    @classmethod
    def get_title(cls) -> str:
        return "Visualize Object Detection"

    async def process(self, context: ProcessingContext) -> ImageRef:
        import matplotlib.pyplot as plt
        import matplotlib.patches as patches
        import io

        image = await context.image_to_pil(self.image)

        # Get the size of the input image
        width, height = image.size

        # Create figure with the same size as the input image
        fig, ax = plt.subplots(
            figsize=(width / 100, height / 100)
        )  # Convert pixels to inches
        ax.imshow(image)

        for obj in self.objects:
            xmin = obj.box.xmin
            ymin = obj.box.ymin
            xmax = obj.box.xmax
            ymax = obj.box.ymax

            rect = patches.Rectangle(
                (xmin, ymin),
                xmax - xmin,
                ymax - ymin,
                linewidth=1,
                edgecolor="r",
                facecolor="none",
            )
            ax.add_patch(rect)
            ax.text(
                xmin,
                ymin,
                f"{obj.label} ({obj.score:.2f})",
                color="r",
                fontsize=8,
                backgroundcolor="w",
            )

        ax.axis("off")

        # Remove padding around the image
        plt.tight_layout(pad=0)

        if fig is None:
            raise ValueError("Invalid plot")
        img_bytes = io.BytesIO()
        fig.savefig(img_bytes, format="png", dpi=100, bbox_inches="tight", pad_inches=0)
        plt.close(fig)
        return await context.image_from_bytes(img_bytes.getvalue())


class ZeroShotObjectDetection(HuggingFacePipelineNode):
    """
    Detects objects in images without the need for training data.
    image, object detection, bounding boxes, zero-shot

    Use cases:
    - Quickly detect objects in images without training data
    - Identify objects in images without predefined labels
    - Automate object detection for large datasets

    Recommended models:
    - google/owlvit-base-patch32
    - google/owlvit-large-patch14
    - google/owlvit-base-patch16
    - google/owlv2-base-patch16
    - google/owlv2-base-patch16-ensemble
    - IDEA-Research/grounding-dino-tiny
    """

    model: HFZeroShotObjectDetection = Field(
        default=HFZeroShotObjectDetection(repo_id="google/owlv2-base-patch16"),
        title="Model ID on Huggingface",
        description="The model ID to use for object detection",
    )
    inputs: ImageRef = Field(
        default=ImageRef(),
        title="Inputs",
        description="The input image for object detection",
    )
    threshold: float = Field(
        default=0.1,
        title="Confidence Threshold",
        description="Minimum confidence score for detected objects",
    )
    top_k: int = Field(
        default=5,
        title="Top K",
        description="The number of top predictions to return",
    )
    candidate_labels: str = Field(
        default="",
        title="Candidate Labels",
        description="The candidate labels to detect in the image, separated by commas",
    )

    @classmethod
    def get_recommended_models(cls) -> list[HFZeroShotObjectDetection]:
        return [
            HFZeroShotObjectDetection(
                repo_id="google/owlvit-base-patch32",
                allow_patterns=["*.bin", "*.json", "**/*.json", "txt"],
            ),
            HFZeroShotObjectDetection(
                repo_id="google/owlvit-large-patch14",
                allow_patterns=["*.bin", "*.json", "**/*.json", "txt"],
            ),
            HFZeroShotObjectDetection(
                repo_id="google/owlvit-base-patch16",
                allow_patterns=["*.bin", "*.json", "**/*.json", "txt"],
            ),
            HFZeroShotObjectDetection(
                repo_id="google/owlv2-base-patch16",
                allow_patterns=["*.bin", "*.json", "**/*.json", "txt"],
            ),
            HFZeroShotObjectDetection(
                repo_id="google/owlv2-base-patch16-ensemble",
                allow_patterns=["*.bin", "*.json", "**/*.json", "txt"],
            ),
            HFZeroShotObjectDetection(
                repo_id="IDEA-Research/grounding-dino-tiny",
                allow_patterns=["*.bin", "*.json", "**/*.json", "txt"],
            ),
        ]

    def required_inputs(self):
        return ["inputs"]

    @classmethod
    def get_title(cls) -> str:
        return "Zero-Shot Object Detection"

    def get_model_id(self):
        return self.model.repo_id

    @property
    def pipeline_task(self) -> str:
        return "zero-shot-object-detection"

    def get_params(self):
        return {
            "candidate_labels": self.candidate_labels.split(","),
            "threshold": self.threshold,
        }

    async def get_inputs(self, context: ProcessingContext):
        return await context.image_to_pil(self.inputs)

    async def process_local_result(
        self, context: ProcessingContext, result: Any
    ) -> list[ObjectDetectionResult]:
        return [
            ObjectDetectionResult(
                label=item["label"],
                score=item["score"],
                box=BoundingBox(
                    xmin=item["box"]["xmin"],
                    ymin=item["box"]["ymin"],
                    xmax=item["box"]["xmax"],
                    ymax=item["box"]["ymax"],
                ),
            )
            for item in result
        ]

    async def process(self, context: ProcessingContext) -> list[ObjectDetectionResult]:
        return await super().process(context)


class DepthEstimation(HuggingFacePipelineNode):
    """
    Estimates depth from a single image.
    image, depth estimation, 3D, huggingface

    Use cases:
    - Generate depth maps for 3D modeling
    - Assist in augmented reality applications
    - Enhance computer vision systems for robotics
    - Improve scene understanding in autonomous vehicles

    Recommended models:
    - LiheYoung/depth-anything-base-hf
    - Intel/dpt-large
    """

    model: HFDepthEstimation = Field(
        default=HFDepthEstimation(repo_id="LiheYoung/depth-anything-base-hf"),
        title="Model ID on Huggingface",
        description="The model ID to use for depth estimation",
    )
    inputs: ImageRef = Field(
        default=ImageRef(),
        title="Image",
        description="The input image for depth estimation",
    )

    @classmethod
    def get_recommended_models(cls) -> list[HFDepthEstimation]:
        return [
            HFDepthEstimation(
                repo_id="depth-anything/Depth-Anything-V2-Small",
                allow_patterns=["*.pth"],
            ),
            HFDepthEstimation(
                repo_id="depth-anything/Depth-Anything-V2-Base",
                allow_patterns=["*.pth"],
            ),
            HFDepthEstimation(
                repo_id="depth-anything/Depth-Anything-V2-Large",
                allow_patterns=["*.pth"],
            ),
            HFDepthEstimation(
                repo_id="Intel/dpt-large",
                allow_patterns=["*.safetensors", "*.json", "**/*.json", "txt"],
            ),
        ]

    def required_inputs(self):
        return ["inputs"]

    @classmethod
    def get_title(cls) -> str:
        return "Depth Estimation"

    def get_model_id(self):
        return self.model.repo_id

    @property
    def pipeline_task(self) -> str:
        return "depth-estimation"

    async def get_inputs(self, context: ProcessingContext):
        return await context.image_to_pil(self.inputs)

    async def process_remote_result(
        self, context: ProcessingContext, result: Any
    ) -> ImageRef:
        depth_map = await context.image_from_base64(result["depth"])
        return depth_map

    async def process_local_result(
        self, context: ProcessingContext, result: Any
    ) -> ImageRef:
        depth_ref = await context.image_from_pil(result["depth"])
        return depth_ref

    async def process(self, context: ProcessingContext) -> ImageRef:
        return await super().process(context)


class BaseImageToImage(HuggingFacePipelineNode):
    """
    Base class for image-to-image transformation tasks.
    image, transformation, generation, huggingface
    """

    @classmethod
    def is_visible(cls) -> bool:
        return cls is not BaseImageToImage

    inputs: ImageRef = Field(
        default=ImageRef(),
        title="Input Image",
        description="The input image to transform",
    )
    prompt: str = Field(
        default="",
        title="Prompt",
        description="The text prompt to guide the image transformation (if applicable)",
    )

    def required_inputs(self):
        return ["inputs"]

    @property
    def pipeline_task(self) -> str:
        return "image-to-image"

    async def get_inputs(self, context: ProcessingContext):
        return await context.image_to_pil(self.inputs)

    async def process_remote_result(
        self, context: ProcessingContext, result: Any
    ) -> ImageRef:
        return await context.image_from_base64(result)

    async def process_local_result(
        self, context: ProcessingContext, result: Any
    ) -> ImageRef:
        return await context.image_from_pil(result)


class Swin2SR(BaseImageToImage):
    """
    Performs image super-resolution using the Swin2SR model.
    image, super-resolution, enhancement, huggingface

    Use cases:
    - Enhance low-resolution images
    - Improve image quality for printing or display
    - Upscale images for better detail
    """

    model: HFImageToImage = Field(
        default=HFImageToImage(),
        title="Model ID on Huggingface",
        description="The model ID to use for image super-resolution",
    )

    @classmethod
    def get_recommended_models(cls) -> list[HFImageToImage]:
        return [
            HFImageToImage(
                repo_id="caidas/swin2SR-classical-sr-x2-64",
                allow_patterns=["*.safetensors", "*.json", "**/*.json"],
            ),
            HFImageToImage(
                repo_id="caidas/swin2SR-classical-sr-x4-48",
                allow_patterns=["*.safetensors", "*.json", "**/*.json"],
            ),
            HFImageToImage(
                repo_id="caidas/swin2SR-lightweight-sr-x2-64",
                allow_patterns=["*.bin", "*.json", "**/*.json"],
            ),
            HFImageToImage(
                repo_id="caidas/swin2SR-realworld-sr-x4-64-bsrgan-psnr",
                allow_patterns=["*.bin", "*.json", "**/*.json"],
            ),
        ]

    @classmethod
    def get_title(cls) -> str:
        return "Swin2SR"

    def get_model_id(self):
        return self.model.repo_id

    def get_params(self):
        return {}


# class InstructPix2Pix(BaseImageToImage):
#     """
#     Performs image editing based on text instructions using the InstructPix2Pix model.
#     image, editing, transformation, huggingface

#     Use cases:
#     - Apply specific edits to images based on text instructions
#     - Modify image content or style guided by text prompts
#     - Create variations of existing images with controlled changes
#     """

#     prompt: str = Field(
#         default="Remove the background.",
#         description="The text prompt to guide the image transformation.",
#     )
#     negative_prompt: str = Field(
#         default="",
#         description="The negative text prompt to avoid in the transformation.",
#     )
#     num_inference_steps: int = Field(
#         default=50, description="The number of denoising steps.", ge=1, le=100
#     )
#     guidance_scale: float = Field(
#         default=7.0, description="The guidance scale for the transformation.", ge=1.0
#     )
#     image_guidance_scale: float = Field(
#         default=7.0,
#         description="The image guidance scale for the transformation.",
#         ge=1.0,
#     )
8
#     @classmethod
#     def get_title(cls) -> str:
#         return "Instruct Pix2Pix"

#     def get_model_id(self):
#         return "timbrooks/instruct-pix2pix"

#     def get_params(self):
#         return {
#             "prompt": self.prompt,
#             "negative_prompt": self.negative_prompt,
#             "num_inference_steps": self.num_inference_steps,
#             "guidance_scale": self.guidance_scale,
#             "image_guidance_scale": self.image_guidance_scale,
#         }


# class AuraFlow(BaseNode):
#     """
#     Generates images using the AuraFlow pipeline.
#     image, generation, AI, text-to-image

#     Use cases:
#     - Create unique images from text descriptions
#     - Generate illustrations for creative projects
#     - Produce visual content for digital media
#     """

#     prompt: str = Field(
#         default="A cat holding a sign that says hello world",
#         description="A text prompt describing the desired image.",
#     )
#     negative_prompt: str = Field(
#         default="", description="A text prompt describing what to avoid in the image."
#     )
#     guidance_scale: float = Field(
#         default=7.0, description="The guidance scale for the transformation.", ge=1.0
#     )
#     num_inference_steps: int = Field(
#         default=25, description="The number of denoising steps.", ge=1, le=100
#     )
#     width: int = Field(
#         default=768, description="The width of the generated image.", ge=128, le=1024
#     )
#     height: int = Field(
#         default=768, description="The height of the generated image.", ge=128, le=1024
#     )
#     seed: int = Field(
#         default=-1,
#         description="Seed for the random number generator. Use -1 for a random seed.",
#         ge=-1,
#     )

#     _pipeline: AuraFlowPipeline | None = None

#     async def initialize(self, context: ProcessingContext):
#         self._pipeline = AuraFlowPipeline.from_pretrained(
#             "fal/AuraFlow", torch_dtype=torch.float16
#         )  # type: ignore

#     async def move_to_device(self, device: str):
#         pass

#     async def process(self, context: ProcessingContext) -> ImageRef:
#         if self._pipeline is None:
#             raise ValueError("Pipeline not initialized")

#         # Set up the generator for reproducibility if a seed is provided
#         generator = None
#         if self.seed != -1:
#             generator = torch.Generator(device=self._pipeline.device).manual_seed(
#                 self.seed
#             )

#         self._pipeline.enable_sequential_cpu_offload()

#         output = self._pipeline(
#             self.prompt,
#             negative_prompt=self.negative_prompt,
#             guidance_scale=self.guidance_scale,
#             num_inference_steps=self.num_inference_steps,
#             width=self.width,
#             height=self.height,
#             generator=generator,
#         )
#         image = output.images[0]  # type: ignore

#         return await context.image_from_pil(image)


class PixArtAlpha(BaseNode):
    """
    Generates images from text prompts using the PixArt-Alpha model.
    image, generation, AI, text-to-image

    Use cases:
    - Create unique images from detailed text descriptions
    - Generate concept art for creative projects
    - Produce visual content for digital media and marketing
    - Explore AI-generated imagery for artistic inspiration
    """

    prompt: str = Field(
        default="An astronaut riding a green horse",
        description="A text prompt describing the desired image.",
    )
    negative_prompt: str = Field(
        default="",
        description="A text prompt describing what to avoid in the image.",
    )
    num_inference_steps: int = Field(
        default=50,
        description="The number of denoising steps.",
        ge=1,
        le=100,
    )
    guidance_scale: float = Field(
        default=7.5,
        description="The scale for classifier-free guidance.",
        ge=1.0,
        le=20.0,
    )
    width: int = Field(
        default=768,
        description="The width of the generated image.",
        ge=128,
        le=1024,
    )
    height: int = Field(
        default=768,
        description="The height of the generated image.",
        ge=128,
        le=1024,
    )
    seed: int = Field(
        default=-1,
        description="Seed for the random number generator. Use -1 for a random seed.",
        ge=-1,
    )

    _pipeline: PixArtAlphaPipeline | None = None

    @classmethod
    def get_recommended_models(cls) -> list[HFImageToImage]:
        return [
            HuggingFaceModel(
                repo_id="PixArt-alpha/PixArt-XL-2-1024-MS",
            ),
        ]

    def get_model_id(self):
        return "PixArt-alpha/PixArt-XL-2-1024-MS"

    async def initialize(self, context: ProcessingContext):
        if not context.is_huggingface_model_cached(self.get_model_id()):
            raise ValueError(f"Model {self.get_model_id()} must be downloaded first")
        self._pipeline = PixArtAlphaPipeline.from_pretrained(
            self.get_model_id(),
            torch_dtype=torch.float16,
            local_files_only=True,
        )  # type: ignore

    async def move_to_device(self, device: str):
        if self._pipeline is not None:
            self._pipeline.to(device)

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        # Set up the generator for reproducibility
        generator = None
        if self.seed != -1:
            generator = torch.Generator(device=self._pipeline.device).manual_seed(
                self.seed
            )

        def callback(step: int, timestep: int, latents: torch.FloatTensor) -> None:
            context.post_message(
                NodeProgress(
                    node_id=self.id,
                    progress=step,
                    total=self.num_inference_steps,
                )
            )

        # Generate the image
        output = self._pipeline(
            prompt=self.prompt,
            negative_prompt=self.negative_prompt,
            num_inference_steps=self.num_inference_steps,
            guidance_scale=self.guidance_scale,
            generator=generator,
            callback=callback,  # type: ignore
            callback_steps=1,
        )

        image = output.images[0]  # type: ignore

        return await context.image_from_pil(image)


class PixArtSigma(BaseNode):
    """
    Generates images from text prompts using the PixArt-Sigma model.
    image, generation, AI, text-to-image

    Use cases:
    - Create unique images from detailed text descriptions
    - Generate concept art for creative projects
    - Produce visual content for digital media and marketing
    - Explore AI-generated imagery for artistic inspiration
    """

    prompt: str = Field(
        default="An astronaut riding a green horse",
        description="A text prompt describing the desired image.",
    )
    negative_prompt: str = Field(
        default="",
        description="A text prompt describing what to avoid in the image.",
    )
    num_inference_steps: int = Field(
        default=50,
        description="The number of denoising steps.",
        ge=1,
        le=100,
    )
    guidance_scale: float = Field(
        default=7.5,
        description="The scale for classifier-free guidance.",
        ge=1.0,
        le=20.0,
    )
    width: int = Field(
        default=768,
        description="The width of the generated image.",
        ge=128,
        le=1024,
    )
    height: int = Field(
        default=768,
        description="The height of the generated image.",
        ge=128,
        le=1024,
    )
    seed: int = Field(
        default=-1,
        description="Seed for the random number generator. Use -1 for a random seed.",
        ge=-1,
    )

    _pipeline: PixArtAlphaPipeline | None = None

    @classmethod
    def get_recommended_models(cls) -> list[HFImageToImage]:
        return [
            HuggingFaceModel(
                repo_id="PixArt-alpha/PixArt-Sigma-XL-2-1024-MS",
            ),
        ]

    def get_model_id(self):
        return "PixArt-alpha/PixArt-Sigma-XL-2-1024-MS"

    async def initialize(self, context: ProcessingContext):
        if not context.is_huggingface_model_cached(self.get_model_id()):
            raise ValueError(f"Model {self.get_model_id()} must be downloaded first")
        self._pipeline = PixArtSigmaPipeline.from_pretrained(
            self.get_model_id(), torch_dtype=torch.float16, local_files_only=True
        )  # type: ignore

    async def move_to_device(self, device: str):
        if self._pipeline is not None:
            self._pipeline.to(device)

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        # Set up the generator for reproducibility
        generator = None
        if self.seed != -1:
            generator = torch.Generator(device=self._pipeline.device).manual_seed(
                self.seed
            )

        def callback(step: int, timestep: int, latents: torch.FloatTensor) -> None:
            context.post_message(
                NodeProgress(
                    node_id=self.id,
                    progress=step,
                    total=self.num_inference_steps,
                )
            )

        # Generate the image
        output = self._pipeline(
            prompt=self.prompt,
            negative_prompt=self.negative_prompt,
            num_inference_steps=self.num_inference_steps,
            guidance_scale=self.guidance_scale,
            generator=generator,
            callback=callback,  # type: ignore
            callback_steps=1,
        )

        image = output.images[0]  # type: ignore

        return await context.image_from_pil(image)


# class Kandinsky2(BaseNode):
#     """
#     Generates images using the Kandinsky 2.2 model from text prompts.
#     image, generation, AI, text-to-image

#     Use cases:
#     - Create high-quality images from text descriptions
#     - Generate detailed illustrations for creative projects
#     - Produce visual content for digital media and art
#     - Explore AI-generated imagery for concept development
#     """

#     @classmethod
#     def get_title(cls) -> str:
#         return "Kandinsky 2.2"

#     prompt: str = Field(
#         default="A photograph of the inside of a subway train. There are raccoons sitting on the seats. One of them is reading a newspaper. The window shows the city in the background.",
#         description="A text prompt describing the desired image.",
#     )
#     negative_prompt: str = Field(
#         default="", description="A text prompt describing what to avoid in the image."
#     )
#     num_inference_steps: int = Field(
#         default=50, description="The number of denoising steps.", ge=1, le=100
#     )
#     width: int = Field(
#         default=768, description="The width of the generated image.", ge=128, le=1024
#     )
#     height: int = Field(
#         default=768, description="The height of the generated image.", ge=128, le=1024
#     )
#     seed: int = Field(
#         default=-1,
#         description="Seed for the random number generator. Use -1 for a random seed.",
#         ge=-1,
#     )

#     _prior_pipeline: KandinskyV22PriorPipeline | None = None
#     _pipeline: KandinskyV22Pipeline | None = None

#     async def initialize(self, context: ProcessingContext):
#         self._prior_pipeline = KandinskyV22PriorPipeline.from_pretrained(
#             "kandinsky-community/kandinsky-2-2-prior", torch_dtype=torch.float16
#         )  # type: ignore
#         self._pipeline = KandinskyV22Pipeline.from_pretrained(
#             "kandinsky-community/kandinsky-2-2-decoder", torch_dtype=torch.float16
#         )  # type: ignore

#     async def process(self, context: ProcessingContext) -> ImageRef:
#         if self._prior_pipeline is None or self._pipeline is None:
#             raise ValueError("Pipelines not initialized")

#         # Set up the generator for reproducibility
#         generator = torch.Generator(device="cpu")
#         if self.seed != -1:
#             generator = generator.manual_seed(self.seed)

#         # Enable sequential CPU offload for memory efficiency
#         self._pipeline.enable_sequential_cpu_offload()

#         # Generate image embeddings
#         prior_output = self._prior_pipeline(
#             self.prompt, negative_prompt=self.negative_prompt, generator=generator
#         )
#         image_emb, negative_image_emb = prior_output.to_tuple()  # type: ignore

#         output = self._pipeline(
#             image_embeds=image_emb,
#             negative_image_embeds=negative_image_emb,
#             height=self.height,
#             width=self.width,
#             num_inference_steps=self.num_inference_steps,
#             generator=generator,
#             callback=progress_callback(self.id, self.num_inference_steps, context),
#             callback_steps=1,
#         )

#         image = output.images[0]  # type: ignore

#         return await context.image_from_pil(image)


# class Kandinsky2Img2Img(BaseNode):
#     """
#     Transforms existing images based on text prompts using the Kandinsky 2.2 model.
#     image, generation, AI, image-to-image

#     Use cases:
#     - Transform existing images based on text prompts
#     - Apply specific styles or concepts to existing images
#     - Modify photographs or artworks with AI-generated elements
#     - Create variations of existing visual content
#     """

#     @classmethod
#     def get_title(cls) -> str:
#         return "Kandinsky 2.2 Image-to-Image"

#     prompt: str = Field(
#         default="A photograph of the inside of a subway train. There are raccoons sitting on the seats. One of them is reading a newspaper. The window shows the city in the background.",
#         description="A text prompt describing the desired image transformation.",
#     )
#     negative_prompt: str = Field(
#         default="", description="A text prompt describing what to avoid in the image."
#     )
#     num_inference_steps: int = Field(
#         default=50, description="The number of denoising steps.", ge=1, le=100
#     )
#     strength: float = Field(
#         default=0.5,
#         description="The strength of the transformation. Use a value between 0.0 and 1.0.",
#         ge=0.0,
#         le=1.0,
#     )
#     image: ImageRef = Field(
#         default=ImageRef(),
#         title="Input Image",
#         description="The input image to transform",
#     )
#     seed: int = Field(
#         default=-1,
#         description="Seed for the random number generator. Use -1 for a random seed.",
#         ge=-1,
#     )

#     _prior_pipeline: KandinskyV22PriorPipeline | None = None
#     _pipeline: KandinskyV22Img2ImgPipeline | None = None

#     def required_inputs(self):
#         return ["image"]

#     async def initialize(self, context: ProcessingContext):
#         self._prior_pipeline = KandinskyV22PriorPipeline.from_pretrained(
#             "kandinsky-community/kandinsky-2-2-prior", torch_dtype=torch.float16
#         )  # type: ignore
#         self._pipeline = KandinskyV22Img2ImgPipeline.from_pretrained(
#             "kandinsky-community/kandinsky-2-2-decoder", torch_dtype=torch.float16
#         )  # type: ignore

#     async def process(self, context: ProcessingContext) -> ImageRef:
#         if self._prior_pipeline is None or self._pipeline is None:
#             raise ValueError("Pipelines not initialized")

#         # Set up the generator for reproducibility
#         generator = torch.Generator(device="cpu")
#         if self.seed != -1:
#             generator = generator.manual_seed(self.seed)

#         # Enable sequential CPU offload for memory efficiency
#         self._prior_pipeline.enable_sequential_cpu_offload()
#         self._pipeline.enable_sequential_cpu_offload()

#         # Generate image embeddings
#         prior_output = self._prior_pipeline(
#             self.prompt, negative_prompt=self.negative_prompt, generator=generator
#         )
#         image_emb, negative_image_emb = prior_output.to_tuple()  # type: ignore

#         input_image = await context.image_to_pil(self.image)
#         output = self._pipeline(
#             image=input_image,
#             image_embeds=image_emb,
#             negative_image_embeds=negative_image_emb,
#             num_inference_steps=self.num_inference_steps,
#             generator=generator,
#             callback=progress_callback(self.id, self.num_inference_steps, context),
#             callback_steps=1,
#         )

#         image = output.images[0]  # type: ignore

#         return await context.image_from_pil(image)


# def make_hint(image: PIL.Image.Image) -> torch.Tensor:
#     np_array = np.array(image)
#     detected_map = torch.from_numpy(np_array).float() / 255.0
#     hint = detected_map.permute(2, 0, 1)
#     return hint[:3, :, :].unsqueeze(0)


# class Kandinsky2ControlNet(BaseNode):
#     """
#     Transforms existing images based on text prompts and control images using the Kandinsky 2.2 model with ControlNet.
#     image, generation, AI, image-to-image, controlnet

#     Use cases:
#     - Transform existing images based on text prompts with precise control
#     - Apply specific styles or concepts to existing images guided by control images
#     - Modify photographs or artworks with AI-generated elements while maintaining specific structures
#     - Create variations of existing visual content with controlled transformations
#     """

#     @classmethod
#     def get_title(cls) -> str:
#         return "Kandinsky 2.2 with ControlNet"

#     prompt: str = Field(
#         default="A photograph of the inside of a subway train. There are raccoons sitting on the seats. One of them is reading a newspaper. The window shows the city in the background.",
#         description="The prompt to guide the image generation.",
#     )
#     negative_prompt: str = Field(
#         default="", description="The prompt not to guide the image generation."
#     )
#     hint: ImageRef = Field(
#         default=ImageRef(),
#         title="Control Image",
#         description="The controlnet condition image.",
#     )
#     height: int = Field(
#         default=512,
#         description="The height in pixels of the generated image.",
#         ge=64,
#         le=2048,
#     )
#     width: int = Field(
#         default=512,
#         description="The width in pixels of the generated image.",
#         ge=64,
#         le=2048,
#     )
#     num_inference_steps: int = Field(
#         default=30, description="The number of denoising steps.", ge=1, le=100
#     )
#     guidance_scale: float = Field(
#         default=4.0,
#         description="Guidance scale as defined in Classifier-Free Diffusion Guidance.",
#         ge=1.0,
#         le=20.0,
#     )
#     seed: int = Field(
#         default=-1,
#         description="Seed for the random number generator. Use -1 for a random seed.",
#         ge=-1,
#     )
#     output_type: str = Field(
#         default="pil",
#         description="The output format of the generated image.",
#     )

#     _prior_pipeline: KandinskyV22PriorPipeline | None = None
#     _pipeline: KandinskyV22ControlnetPipeline | None = None

#     def required_inputs(self):
#         return ["hint"]

#     async def initialize(self, context: ProcessingContext):
#         self._prior_pipeline = KandinskyV22PriorPipeline.from_pretrained(
#             "kandinsky-community/kandinsky-2-2-prior", torch_dtype=torch.float16
#         )  # type: ignore
#         self._pipeline = KandinskyV22ControlnetPipeline.from_pretrained(
#             "kandinsky-community/kandinsky-2-2-controlnet-depth",
#             torch_dtype=torch.float16,
#         )  # type: ignore

#     async def process(self, context: ProcessingContext) -> ImageRef:
#         if self._prior_pipeline is None or self._pipeline is None:
#             raise ValueError("Pipelines not initialized")

#         # Set up the generator for reproducibility
#         generator = torch.Generator(device="cpu")
#         if self.seed != -1:
#             generator = generator.manual_seed(self.seed)

#         # Enable sequential CPU offload for memory efficiency
#         self._prior_pipeline.enable_sequential_cpu_offload()
#         self._pipeline.enable_sequential_cpu_offload()

#         # Generate image embeddings
#         prior_output = self._prior_pipeline(
#             self.prompt, negative_prompt=self.negative_prompt, generator=generator
#         )
#         image_emb, negative_image_emb = prior_output.to_tuple()  # type: ignore

#         # Prepare the control image (hint)
#         hint = await context.image_to_pil(self.hint)
#         hint = hint.resize((self.width, self.height))

#         output = self._pipeline(
#             hint=make_hint(hint),
#             image_embeds=image_emb,
#             negative_image_embeds=negative_image_emb,
#             height=self.height,
#             width=self.width,
#             num_inference_steps=self.num_inference_steps,
#             guidance_scale=self.guidance_scale,
#             generator=generator,
#             output_type="pil",
#             callback=progress_callback(self.id, self.num_inference_steps, context),  # type: ignore
#             callback_steps=1,
#         )

#         return await context.image_from_pil(output.images[0])  # type: ignore


class Kandinsky3(BaseNode):
    """
    Generates images using the Kandinsky-3 model from text prompts.
    image, generation, AI, text-to-image

    Use cases:
    - Create detailed images from text descriptions
    - Generate unique illustrations for creative projects
    - Produce visual content for digital media and art
    - Explore AI-generated imagery for concept development
    """

    prompt: str = Field(
        default="A photograph of the inside of a subway train. There are raccoons sitting on the seats. One of them is reading a newspaper. The window shows the city in the background.",
        description="A text prompt describing the desired image.",
    )
    num_inference_steps: int = Field(
        default=25, description="The number of denoising steps.", ge=1, le=100
    )
    width: int = Field(
        default=1024, description="The width of the generated image.", ge=64, le=2048
    )
    height: int = Field(
        default=1024, description="The height of the generated image.", ge=64, le=2048
    )
    seed: int = Field(
        default=0,
        description="Seed for the random number generator. Use -1 for a random seed.",
        ge=-1,
    )

    _pipeline: AutoPipelineForText2Image | None = None

    @classmethod
    def get_recommended_models(cls) -> list[HuggingFaceModel]:
        return [
            HuggingFaceModel(
                repo_id="kandinsky-community/kandinsky-3",
            ),
        ]

    @classmethod
    def get_title(cls) -> str:
        return "Kandinsky 3"

    async def initialize(self, context: ProcessingContext):
        if not context.is_huggingface_model_cached("kandinsky-community/kandinsky-3"):
            raise ValueError(
                f"Model kandinsky-community/kandinsky-3 must be downloaded first"
            )
        self._pipeline = AutoPipelineForText2Image.from_pretrained(
            "kandinsky-community/kandinsky-3",
            variant="fp16",
            torch_dtype=torch.float16,
            local_files_only=True,
        )

    async def move_to_device(self, device: str):
        # Commented out as in the original class
        # if self._pipeline is not None:
        #     self._pipeline.to(device)
        pass

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        # Set up the generator for reproducibility
        generator = torch.Generator(device="cpu")
        if self.seed != -1:
            generator = generator.manual_seed(self.seed)

        self._pipeline.enable_sequential_cpu_offload()

        output = self._pipeline(
            prompt=self.prompt,
            num_inference_steps=self.num_inference_steps,
            generator=generator,
            width=self.width,
            height=self.height,
            callback=progress_callback(self.id, self.num_inference_steps, context),
            callback_steps=1,
        )  # type: ignore

        image = output.images[0]

        return await context.image_from_pil(image)


class Kandinsky3Img2Img(BaseNode):
    """
    Transforms existing images using the Kandinsky-3 model based on text prompts.
    image, generation, AI, image-to-image

    Use cases:
    - Modify existing images based on text descriptions
    - Apply specific styles or concepts to photographs or artwork
    - Create variations of existing visual content
    - Blend AI-generated elements with existing images
    """

    prompt: str = Field(
        default="A photograph of the inside of a subway train. There are raccoons sitting on the seats. One of them is reading a newspaper. The window shows the city in the background.",
        description="A text prompt describing the desired image transformation.",
    )
    num_inference_steps: int = Field(
        default=25, description="The number of denoising steps.", ge=1, le=100
    )
    strength: float = Field(
        default=0.5,
        description="The strength of the transformation. Use a value between 0.0 and 1.0.",
        ge=0.0,
        le=1.0,
    )
    image: ImageRef = Field(
        default=ImageRef(),
        title="Input Image",
        description="The input image to transform",
    )
    seed: int = Field(
        default=0,
        description="Seed for the random number generator. Use -1 for a random seed.",
        ge=-1,
    )

    _pipeline: AutoPipelineForImage2Image | None = None

    @classmethod
    def get_recommended_models(cls) -> list[HuggingFaceModel]:
        return [
            HuggingFaceModel(
                repo_id="kandinsky-community/kandinsky-3",
            ),
        ]

    def required_inputs(self):
        return ["image"]

    @classmethod
    def get_title(cls) -> str:
        return "Kandinsky 3 Image-to-Image"

    def get_model_id(self) -> str:
        return "kandinsky-community/kandinsky-3"

    async def initialize(self, context: ProcessingContext):
        if not context.is_huggingface_model_cached(self.get_model_id()):
            raise ValueError(f"Model {self.get_model_id()} must be downloaded first")
        self._pipeline = AutoPipelineForImage2Image.from_pretrained(
            self.get_model_id(),
            variant="fp16",
            torch_dtype=torch.float16,
            local_files_only=True,
        )

    async def move_to_device(self, device: str):
        pass

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        # Set up the generator for reproducibility
        generator = torch.Generator(device="cpu")
        if self.seed != -1:
            generator = generator.manual_seed(self.seed)

        self._pipeline.enable_sequential_cpu_offload()

        input_image = await context.image_to_pil(self.image)
        output = self._pipeline(
            prompt=self.prompt,
            num_inference_steps=self.num_inference_steps,
            generator=generator,
            image=input_image,
            callback=progress_callback(self.id, self.num_inference_steps, context),
            callback_steps=1,
        )  # type: ignore

        image = output.images[0]

        return await context.image_from_pil(image)


class PlaygroundV2(BaseNode):
    """
    Playground v2.5 is the state-of-the-art open-source model in aesthetic quality.
    image, generation, AI, text-to-image

    Use cases:
    - Create detailed images from text descriptions
    - Generate unique illustrations for creative projects
    - Produce visual content for digital media and art
    - Explore AI-generated imagery for concept development
    """

    prompt: str = Field(
        default="A photograph of the inside of a subway train. There are raccoons sitting on the seats. One of them is reading a newspaper. The window shows the city in the background.",
        description="A text prompt describing the desired image.",
    )
    num_inference_steps: int = Field(
        default=25, description="The number of denoising steps.", ge=1, le=100
    )
    guidance_scale: float = Field(
        default=7.5,
        description="The scale for classifier-free guidance.",
        ge=1.0,
        le=20.0,
    )
    width: int = Field(
        default=1024, description="The width of the generated image.", ge=64, le=2048
    )
    height: int = Field(
        default=1024, description="The height of the generated image.", ge=64, le=2048
    )
    seed: int = Field(
        default=0,
        description="Seed for the random number generator. Use -1 for a random seed.",
        ge=-1,
    )

    _pipeline: DiffusionPipeline | None = None

    @classmethod
    def get_title(cls) -> str:
        return "Playground v2.5"

    @classmethod
    def get_recommended_models(cls) -> list[HuggingFaceModel]:
        return [
            HuggingFaceModel(
                repo_id="playgroundai/playground-v2.5-1024px-aesthetic",
                allow_patterns=[
                    "text_encoder/model.fp16.safetensors",
                    "text_encoder_2/model.fp16.safetensors",
                    "unet/diffusion_pytorch_model.fp16.safetensors",
                    "vae/diffusion_pytorch_model.fp16.safetensors",
                    "*.json",
                    "**/*.json",
                    "*.txt",
                    "**/*.txt",
                ],
            ),
        ]

    async def initialize(self, context: ProcessingContext):
        if not context.is_huggingface_model_cached(
            "playgroundai/playground-v2.5-1024px-aesthetic"
        ):
            raise ValueError(
                f"Model playgroundai/playground-v2.5-1024px-aesthetic must be downloaded first"
            )
        self._pipeline = DiffusionPipeline.from_pretrained(
            "playgroundai/playground-v2.5-1024px-aesthetic",
            torch_dtype=torch.float16,
            variant="fp16",
            local_files_only=True,
        )  # type: ignore

    async def move_to_device(self, device: str):
        # if self._pipeline is not None:
        if self._pipeline is not None:
            self._pipeline.to(device)

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        # Set up the generator for reproducibility
        generator = torch.Generator(device="cpu")
        if self.seed != -1:
            generator = generator.manual_seed(self.seed)

        output = self._pipeline(
            prompt=self.prompt,
            num_inference_steps=self.num_inference_steps,
            generator=generator,
            width=self.width,
            height=self.height,
            callback=progress_callback(self.id, self.num_inference_steps, context),
            callback_steps=1,
        )  # type: ignore

        image = output.images[0]

        return await context.image_from_pil(image)


class Proteus(BaseNode):
    """
    Proteus is an open-source text-to-image generation model.
    image, generation, AI, text-to-image

    Use cases:
    - Generate images from textual descriptions
    - Create unique visual content for creative projects
    - Explore AI-generated imagery for concept development
    - Produce illustrations for various applications
    """

    prompt: str = Field(
        default="black fluffy gorgeous dangerous cat animal creature, large orange eyes, big fluffy ears, piercing gaze, full moon, dark ambiance, best quality, extremely detailed",
        description="A text prompt describing the desired image.",
    )
    num_inference_steps: int = Field(
        default=50, description="The number of denoising steps.", ge=1, le=100
    )
    guidance_scale: float = Field(
        default=7.5,
        description="The scale for classifier-free guidance.",
        ge=1.0,
        le=20.0,
    )
    seed: int = Field(
        default=0,
        description="Seed for the random number generator. Use -1 for a random seed.",
        ge=-1,
    )

    _pipeline: AutoPipelineForText2Image | None = None

    @classmethod
    def get_title(cls) -> str:
        return "Proteus"

    @classmethod
    def get_recommended_models(cls) -> list[HuggingFaceModel]:
        return [
            HuggingFaceModel(
                repo_id="dataautogpt3/ProteusV0.5",
                allow_patterns=[
                    "**/*.safetensors",
                    "*.json",
                    "**/*.json",
                    "*.txt",
                    "**/*.txt",
                ],
                ignore_patterns=[
                    "proteusV0.5.safetensors",
                ],
            ),
        ]

    async def initialize(self, context: ProcessingContext):
        if not context.is_huggingface_model_cached("dataautogpt3/ProteusV0.5"):
            raise ValueError(f"Model dataautogpt3/ProteusV0.5 must be downloaded first")
        self._pipeline = AutoPipelineForText2Image.from_pretrained(
            "dataautogpt3/ProteusV0.5",
            torch_dtype=torch.float16,
        )

    async def move_to_device(self, device: str):
        if self._pipeline is not None:
            self._pipeline.to(device)

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        # Set up the generator for reproducibility
        generator = torch.Generator(device="cuda")
        if self.seed != -1:
            generator = generator.manual_seed(self.seed)

        output = self._pipeline(
            prompt=self.prompt,
            num_inference_steps=self.num_inference_steps,
            guidance_scale=self.guidance_scale,
            generator=generator,
            callback=progress_callback(self.id, self.num_inference_steps, context),
            callback_steps=1,
        )  # type: ignore

        image = output.images[0]

        return await context.image_from_pil(image)


class StableDiffusionBaseNode(BaseNode):
    model: HFStableDiffusion = Field(
        default=HFStableDiffusion(),
        description="The model to use for image generation.",
    )
    prompt: str = Field(default="", description="The prompt for image generation.")
    negative_prompt: str = Field(
        default="",
        description="The negative prompt to guide what should not appear in the generated image.",
    )
    seed: int = Field(
        default=-1,
        ge=-1,
        le=2**32 - 1,
        description="Seed for the random number generator. Use -1 for a random seed.",
    )
    num_inference_steps: int = Field(
        default=25, ge=1, le=100, description="Number of denoising steps."
    )
    guidance_scale: float = Field(
        default=7.5, ge=1.0, le=20.0, description="Guidance scale for generation."
    )
    scheduler: StableDiffusionScheduler = Field(
        default=StableDiffusionScheduler.HeunDiscreteScheduler,
        description="The scheduler to use for the diffusion process.",
    )
    lora_model: LORA_Model = Field(
        default=LORA_Model.NONE,
        description="The LORA model to use for image processing",
    )
    lora_scale: float = Field(
        default=0.5,
        ge=0.0,
        le=3.0,
        description="Strength of the LORA image",
    )
    ip_adapter_model: IPAdapter_SD15_Model = Field(
        default=IPAdapter_SD15_Model.NONE,
        description="The IP adapter model to use for image processing",
    )
    ip_adapter_image: ImageRef = Field(
        default=ImageRef(),
        description="When provided the image will be fed into the IP adapter",
    )
    ip_adapter_scale: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Strength of the IP adapter image",
    )

    _pipeline: Any = None

    @classmethod
    def get_recommended_models(cls) -> list[HuggingFaceModel]:
        return [
            HFStableDiffusion(
                repo_id="Lykon/dreamshaper-8",
                allow_patterns=[
                    "**/*.fp16.safetensors",
                    "**/*.json",
                    "**/*.txt",
                ],
            ),
            HFIPAdapter(
                repo_id="h94/IP-Adapter",
                allow_patterns=[
                    "models/*.safetensors",
                ],
            ),
            HFLora(
                repo_id="danbrown/loras",
                allow_patterns=[
                    "*.safetensors",
                ],
            ),
        ]

    @classmethod
    def is_visible(cls) -> bool:
        return cls is not StableDiffusionBaseNode

    async def initialize(self, context: ProcessingContext):
        raise NotImplementedError("Subclasses must implement this method")

    async def _setup_ip_adapter(self, context: ProcessingContext):
        self._pipeline.set_ip_adapter_scale(self.ip_adapter_scale)
        if self.ip_adapter_model != IPAdapter_SD15_Model.NONE:
            if not self.ip_adapter_image.is_empty():
                if not context.is_huggingface_model_cached("h94/IP-Adapter"):
                    raise ValueError(f"Model h94/IP-Adapter must be downloaded first")
                self._load_ip_adapter()
                return await context.image_to_pil(self.ip_adapter_image)
        return None

    def _load_ip_adapter(self):
        if self.ip_adapter_model != IPAdapter_SD15_Model.NONE:
            self._pipeline.load_ip_adapter(
                "h94/IP-Adapter",
                subfolder="models",
                weight_name=self.ip_adapter_model,
            )

    def _load_lora(self):
        if self.lora_model != LORA_Model.NONE:
            self._pipeline.load_lora_weights(
                LORA_WEIGHTS[self.lora_model]["repo"],
                weight_name=LORA_WEIGHTS[self.lora_model]["weight_name"],
                adapter_name=self.lora_model.value,
            )

    def _set_scheduler(self, scheduler_type: StableDiffusionScheduler):
        scheduler_class = get_scheduler_class(scheduler_type)
        self._pipeline.scheduler = scheduler_class.from_config(
            self._pipeline.scheduler.config
        )

    async def move_to_device(self, device: str):
        if self._pipeline is not None:
            self._pipeline.to(device)

    def _setup_generator(self):
        generator = torch.Generator(device="cuda")
        if self.seed != -1:
            generator = generator.manual_seed(self.seed)
        return generator

    def progress_callback(self, context: ProcessingContext):
        def callback(step: int, timestep: int, latents: torch.FloatTensor) -> None:
            context.post_message(
                NodeProgress(
                    node_id=self.id,
                    progress=step,
                    total=self.num_inference_steps,
                )
            )

        return callback

    async def process(self, context: ProcessingContext) -> ImageRef:
        raise NotImplementedError("Subclasses must implement this method")


class StableDiffusion(StableDiffusionBaseNode):
    """
    Generates images from text prompts using Stable Diffusion.
    image, generation, AI, text-to-image

    Use cases:
    - Creating custom illustrations for various projects
    - Generating concept art for creative endeavors
    - Producing unique visual content for marketing materials
    - Exploring AI-generated art for personal or professional use
    """

    width: int = Field(
        default=512, ge=256, le=1024, description="Width of the generated image."
    )
    height: int = Field(
        default=512, ge=256, le=1024, description="Height of the generated image"
    )
    _pipeline: StableDiffusionPipeline | None = None

    @classmethod
    def get_title(cls):
        return "Stable Diffusion"

    async def initialize(self, context: ProcessingContext):
        if self._pipeline is None:
            if not context.is_huggingface_model_cached(self.model.repo_id):
                raise ValueError(f"Model {self.model.repo_id} must be downloaded first")
            self._pipeline = StableDiffusionPipeline.from_pretrained(
                self.model.repo_id,
                torch_dtype=torch.float16,
                safety_checker=None,
                local_files_only=True,
            )  # type: ignore
            assert self._pipeline is not None
            self._set_scheduler(self.scheduler)

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        self._load_lora()
        generator = self._setup_generator()
        ip_adapter_image = await self._setup_ip_adapter(context)

        image = self._pipeline(
            prompt=self.prompt,
            negative_prompt=self.negative_prompt,
            num_inference_steps=self.num_inference_steps,
            guidance_scale=self.guidance_scale,
            width=self.width,
            height=self.height,
            generator=generator,
            ip_adapter_image=ip_adapter_image,
            callback=self.progress_callback(context),
            callback_steps=1,
        ).images[  # type: ignore
            0
        ]

        return await context.image_from_pil(image)


class StableDiffusionControlNetNode(StableDiffusionBaseNode):
    """
    Generates images using Stable Diffusion with ControlNet guidance.
    image, generation, AI, text-to-image, controlnet

    Use cases:
    - Generate images with precise control over composition and structure
    - Create variations of existing images while maintaining specific features
    - Artistic image generation with guided outputs
    """

    controlnet: HFControlNet = Field(
        default=HFControlNet(),
        description="The ControlNet model to use for guidance.",
    )
    control_image: ImageRef = Field(
        default=ImageRef(),
        description="The control image to guide the generation process.",
    )
    controlnet_conditioning_scale: float = Field(
        default=1.0,
        description="The scale for ControlNet conditioning.",
        ge=0.0,
        le=2.0,
    )

    _pipeline: StableDiffusionControlNetPipeline | None = None

    @classmethod
    def get_recommended_models(cls) -> list[HuggingFaceModel]:
        return [
            HFControlNet(
                repo_id="lllyasviel/sd-controlnet-canny",
                allow_patterns=[
                    "*.safetensors",
                    "*.json",
                ],
            ),
            HFControlNet(
                repo_id="lllyasviel/sd-controlnet-depth",
                allow_patterns=[
                    "*.safetensors",
                    "*.json",
                ],
            ),
            HFControlNet(
                repo_id="lllyasviel/sd-controlnet-openpose",
                allow_patterns=[
                    "*.safetensors",
                    "*.json",
                ],
            ),
            HFControlNet(
                repo_id="lllyasviel/sd-controlnet-scribble",
                allow_patterns=[
                    "*.safetensors",
                    "*.json",
                ],
            ),
            HFControlNet(
                repo_id="lllyasviel/sd-controlnet-seg",
                allow_patterns=[
                    "*.safetensors",
                    "*.json",
                ],
            ),
            HFControlNet(
                repo_id="lllyasviel/sd-controlnet-hed",
                allow_patterns=[
                    "*.safetensors",
                    "*.json",
                ],
            ),
            HFControlNet(
                repo_id="lllyasviel/sd-controlnet-normal",
                allow_patterns=[
                    "*.safetensors",
                    "*.json",
                ],
            ),
            HFControlNet(
                repo_id="lllyasviel/sd-controlnet-mlsd",
                allow_patterns=[
                    "*.safetensors",
                    "*.json",
                ],
            ),
        ]

    def required_inputs(self):
        return ["control_image"]

    @classmethod
    def get_title(cls):
        return "Stable Diffusion ControlNet"

    async def initialize(self, context: ProcessingContext):
        if not context.is_huggingface_model_cached(self.controlnet.value):
            raise ValueError(
                f"ControlNet model {self.controlnet.value} must be downloaded first"
            )
        if not context.is_huggingface_model_cached(self.model.repo_id):
            raise ValueError(f"Model {self.model.repo_id} must be downloaded first")

        controlnet = ControlNetModel.from_pretrained(
            self.controlnet.repo_id, torch_dtype=torch.float16, local_files_only=True
        )
        self._pipeline = StableDiffusionControlNetPipeline.from_pretrained(
            self.model.repo_id,
            controlnet=controlnet,
            torch_dtype=torch.float16,
            local_files_only=True,
        )  # type: ignore
        self._pipeline.enable_model_cpu_offload()  # type: ignore

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        control_image = await context.image_to_pil(self.control_image)
        ip_adapter_image = await self._setup_ip_adapter(context)
        generator = self._setup_generator()
        self._load_lora()

        image = self._pipeline(
            prompt=self.prompt,
            negative_prompt=self.negative_prompt,
            image=control_image,
            ip_adapter_image=ip_adapter_image,
            width=control_image.width,
            height=control_image.height,
            num_inference_steps=self.num_inference_steps,
            guidance_scale=self.guidance_scale,
            controlnet_conditioning_scale=self.controlnet_conditioning_scale,
            generator=generator,
            callback=self.progress_callback(context),
            callback_steps=1,
        ).images[  # type: ignore
            0
        ]  # type: ignore

        return await context.image_from_pil(image)


class StableDiffusionImg2ImgNode(StableDiffusionBaseNode):
    """
    Transforms existing images based on text prompts using Stable Diffusion.
    image, generation, AI, image-to-image

    Use cases:
    - Modifying existing images to fit a specific style or theme
    - Enhancing or altering photographs
    - Creating variations of existing artwork
    - Applying text-guided edits to images
    """

    init_image: ImageRef = Field(
        default=ImageRef(),
        description="The initial image for Image-to-Image generation.",
    )
    strength: float = Field(
        default=0.8,
        ge=0.0,
        le=1.0,
        description="Strength for Image-to-Image generation. Higher values allow for more deviation from the original image.",
    )
    _pipeline: StableDiffusionImg2ImgPipeline | None = None

    def required_inputs(self):
        return ["init_image"]

    @classmethod
    def get_title(cls):
        return "Stable Diffusion (Img2Img)"

    async def initialize(self, context: ProcessingContext):
        if self._pipeline is None:
            if not context.is_huggingface_model_cached(self.model.repo_id):
                raise ValueError(f"Model {self.model.repo_id} must be downloaded first")
            self._pipeline = StableDiffusionImg2ImgPipeline.from_pretrained(
                self.model.repo_id,
                torch_dtype=torch.float16,
                safety_checker=None,
                local_files_only=True,
            )  # type: ignore
            self._set_scheduler(self.scheduler)

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        generator = self._setup_generator()
        init_image = await context.image_to_pil(self.init_image)
        ip_adapter_image = await self._setup_ip_adapter(context)
        self._load_lora()

        image = self._pipeline(
            prompt=self.prompt,
            image=init_image,
            ip_adapter_image=ip_adapter_image,
            negative_prompt=self.negative_prompt,
            num_inference_steps=self.num_inference_steps,
            guidance_scale=self.guidance_scale,
            width=init_image.width,
            height=init_image.height,
            strength=self.strength,
            generator=generator,
            callback=self.progress_callback(context),
            callback_steps=1,
        ).images[  # type: ignore
            0
        ]

        return await context.image_from_pil(image)


class StableDiffusionControlNetInpaintNode(StableDiffusionBaseNode):
    """
    Performs inpainting on images using Stable Diffusion with ControlNet guidance.
    image, inpainting, AI, controlnet

    Use cases:
    - Remove unwanted objects from images with precise control
    - Fill in missing parts of images guided by control images
    - Modify specific areas of images while preserving the rest and maintaining structure
    """

    class StableDiffusionControlNetModel(str, Enum):
        INPAINT = "lllyasviel/control_v11p_sd15_inpaint"

    controlnet: StableDiffusionControlNetModel = Field(
        default=StableDiffusionControlNetModel.INPAINT,
        description="The ControlNet model to use for guidance.",
    )
    init_image: ImageRef = Field(
        default=ImageRef(),
        description="The initial image to be inpainted.",
    )
    mask_image: ImageRef = Field(
        default=ImageRef(),
        description="The mask image indicating areas to be inpainted.",
    )
    control_image: ImageRef = Field(
        default=ImageRef(),
        description="The control image to guide the inpainting process.",
    )
    controlnet_conditioning_scale: float = Field(
        default=0.5,
        description="The scale for ControlNet conditioning.",
        ge=0.0,
        le=2.0,
    )

    _pipeline: StableDiffusionControlNetInpaintPipeline | None = None

    def required_inputs(self):
        return ["init_image", "mask_image", "control_image"]

    @classmethod
    def get_title(cls):
        return "Stable Diffusion ControlNet Inpaint"

    async def initialize(self, context: ProcessingContext):
        if not context.is_huggingface_model_cached(self.controlnet.value):
            raise ValueError(
                f"ControlNet model {self.controlnet.value} must be downloaded first"
            )
        if not context.is_huggingface_model_cached(self.model.repo_id):
            raise ValueError(f"Model {self.model.repo_id} must be downloaded first")

        controlnet = ControlNetModel.from_pretrained(
            self.controlnet.value, torch_dtype=torch.float16, local_files_only=True
        )
        self._pipeline = StableDiffusionControlNetInpaintPipeline.from_pretrained(
            self.model.repo_id,
            controlnet=controlnet,
            torch_dtype=torch.float16,
            local_files_only=True,
        )  # type: ignore
        self._pipeline.enable_model_cpu_offload()  # type: ignore

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        init_image = await context.image_to_pil(self.init_image)
        mask_image = await context.image_to_pil(self.mask_image)
        control_image = await context.image_to_pil(self.control_image)
        ip_adapter_image = await self._setup_ip_adapter(context)
        generator = self._setup_generator()
        self._load_lora()

        image = self._pipeline(
            prompt=self.prompt,
            negative_prompt=self.negative_prompt,
            image=init_image,
            mask_image=mask_image,
            control_image=control_image,
            ip_adapter_image=ip_adapter_image,
            width=init_image.width,
            height=init_image.height,
            num_inference_steps=self.num_inference_steps,
            guidance_scale=self.guidance_scale,
            controlnet_conditioning_scale=self.controlnet_conditioning_scale,
            generator=generator,
            callback=self.progress_callback(context),
            callback_steps=1,
        ).images[  # type: ignore
            0
        ]

        return await context.image_from_pil(image)


class StableDiffusionInpaintNode(StableDiffusionBaseNode):
    """
    Performs inpainting on images using Stable Diffusion.
    image, inpainting, AI

    Use cases:
    - Remove unwanted objects from images
    - Fill in missing parts of images
    - Modify specific areas of images while preserving the rest
    """

    init_image: ImageRef = Field(
        default=ImageRef(),
        description="The initial image to be inpainted.",
    )
    mask_image: ImageRef = Field(
        default=ImageRef(),
        description="The mask image indicating areas to be inpainted.",
    )
    strength: float = Field(
        default=0.8,
        ge=0.0,
        le=1.0,
        description="Strength for inpainting. Higher values allow for more deviation from the original image.",
    )
    _pipeline: StableDiffusionInpaintPipeline | None = None

    def required_inputs(self):
        return ["init_image", "mask_image"]

    @classmethod
    def get_title(cls):
        return "Stable Diffusion (Inpaint)"

    async def initialize(self, context: ProcessingContext):
        if self._pipeline is None:
            if not context.is_huggingface_model_cached(self.model.repo_id):
                raise ValueError(f"Model {self.model.repo_id} must be downloaded first")
            self._pipeline = StableDiffusionInpaintPipeline.from_pretrained(
                "runwayml/stable-diffusion-inpainting",
                torch_dtype=torch.float16,
                safety_checker=None,
                local_files_only=True,
            )  # type: ignore
            self._load_ip_adapter()
            self._set_scheduler(self.scheduler)

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        generator = self._setup_generator()
        init_image = await context.image_to_pil(self.init_image)
        mask_image = await context.image_to_pil(self.mask_image)
        ip_adapter_image = await self._setup_ip_adapter(context)
        self._load_lora()

        image = self._pipeline(
            prompt=self.prompt,
            image=init_image,
            mask_image=mask_image,
            negative_prompt=self.negative_prompt,
            num_inference_steps=self.num_inference_steps,
            guidance_scale=self.guidance_scale,
            width=init_image.width,
            height=init_image.height,
            strength=self.strength,
            generator=generator,
            ip_adapter_image=ip_adapter_image,
            callback=self.progress_callback(context),
            callback_steps=1,
        ).images[  # type: ignore
            0
        ]

        return await context.image_from_pil(image)


class StableDiffusionControlNetImg2ImgNode(StableDiffusionBaseNode):
    """
    Transforms existing images using Stable Diffusion with ControlNet guidance.
    image, generation, AI, image-to-image, controlnet

    Use cases:
    - Modify existing images with precise control over composition and structure
    - Apply specific styles or concepts to photographs or artwork with guided transformations
    - Create variations of existing visual content while maintaining certain features
    - Enhance image editing capabilities with AI-guided transformations
    """

    controlnet: HFControlNet = Field(
        default=HFControlNet(),
        description="The ControlNet model to use for guidance.",
    )
    image: ImageRef = Field(
        default=ImageRef(),
        description="The input image to be transformed.",
    )
    control_image: ImageRef = Field(
        default=ImageRef(),
        description="The control image to guide the transformation.",
    )

    _pipeline: StableDiffusionControlNetImg2ImgPipeline | None = None

    def required_inputs(self):
        return ["image", "control_image"]

    @classmethod
    def get_title(cls):
        return "Stable Diffusion ControlNet (Img2Img)"

    async def initialize(self, context: ProcessingContext):
        if not context.is_huggingface_model_cached(self.controlnet.repo_id):
            raise ValueError(
                f"ControlNet model {self.controlnet.repo_id} must be downloaded first"
            )
        if not context.is_huggingface_model_cached(self.model.repo_id):
            raise ValueError(f"Model {self.model.repo_id} must be downloaded first")
        controlnet = ControlNetModel.from_pretrained(
            self.controlnet.repo_id, torch_dtype=torch.float16, local_files_only=True
        )
        self._pipeline = StableDiffusionControlNetImg2ImgPipeline.from_pretrained(
            self.model.repo_id,
            controlnet=controlnet,
            torch_dtype=torch.float16,
            local_files_only=True,
        )  # type: ignore
        self._pipeline.enable_model_cpu_offload()  # type: ignore
        self._set_scheduler(self.scheduler)

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        input_image = await context.image_to_pil(self.image)
        control_image = await context.image_to_pil(self.control_image)
        ip_adapter_image = await self._setup_ip_adapter(context)
        self._load_lora()

        generator = torch.Generator(device="cuda").manual_seed(self.seed)

        image = self._pipeline(
            prompt=self.prompt,
            image=input_image,
            control_image=control_image,
            ip_adapter_image=ip_adapter_image,
            width=input_image.width,
            height=input_image.height,
            num_inference_steps=self.num_inference_steps,
            generator=generator,
            callback=self.progress_callback(context),
            callback_steps=1,
        ).images[  # type: ignore
            0
        ]

        return await context.image_from_pil(image)


class StableDiffusionUpscale(BaseNode):
    """
    Upscales an image using Stable Diffusion 4x upscaler.
    image, upscaling, AI, stable-diffusion

    Use cases:
    - Enhance low-resolution images
    - Improve image quality for printing or display
    - Create high-resolution versions of small images
    """

    prompt: str = Field(
        default="",
        description="The prompt for image generation.",
    )
    negative_prompt: str = Field(
        default="",
        description="The negative prompt to guide what should not appear in the generated image.",
    )
    num_inference_steps: int = Field(
        default=25,
        ge=1,
        le=100,
        description="Number of upscaling steps.",
    )
    guidance_scale: float = Field(
        default=7.5,
        ge=1.0,
        le=20.0,
        description="Guidance scale for generation.",
    )
    image: ImageRef = Field(
        default=ImageRef(),
        description="The initial image for Image-to-Image generation.",
    )
    scheduler: StableDiffusionScheduler = Field(
        default=StableDiffusionScheduler.HeunDiscreteScheduler,
        description="The scheduler to use for the diffusion process.",
    )
    seed: int = Field(
        default=-1,
        ge=-1,
        le=2**32 - 1,
        description="Seed for the random number generator. Use -1 for a random seed.",
    )

    def required_inputs(self):
        return ["image"]

    @classmethod
    def get_title(cls):
        return "Stable Diffusion Upscale"

    _pipeline: StableDiffusionUpscalePipeline | None = None

    @classmethod
    def get_recommended_models(cls) -> list[str]:
        return [
            HFStableDiffusionXL(
                repo_id="stabilityai/stable-diffusion-x4-upscaler",
                allow_patterns=["**/*.fp16.safetensors", "**/*.json", "**/*.txt"],
            )
        ]

    async def initialize(self, context: ProcessingContext):
        self._pipeline = StableDiffusionUpscalePipeline.from_pretrained(
            "stabilityai/stable-diffusion-x4-upscaler",
            torch_dtype=torch.float16,
            variant="fp16",
            local_files_only=True,
        )  # type: ignore
        self._set_scheduler(self.scheduler)

    def _set_scheduler(self, scheduler_type: StableDiffusionScheduler):
        if self._pipeline is not None:
            scheduler_class = get_scheduler_class(scheduler_type)
            self._pipeline.scheduler = scheduler_class.from_config(
                self._pipeline.scheduler.config
            )

    async def move_to_device(self, device: str):
        if self._pipeline is not None:
            self._pipeline.to(device)

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        input_image = await context.image_to_pil(self.image)

        generator = torch.Generator(device="cpu")
        if self.seed != -1:
            generator = generator.manual_seed(self.seed)

        upscaled_image = self._pipeline(
            prompt=self.prompt,
            negative_prompt=self.negative_prompt,
            image=input_image,
            num_inference_steps=self.num_inference_steps,
            guidance_scale=self.guidance_scale,
            callback=progress_callback(self.id, self.num_inference_steps, context),  # type: ignore
        ).images[  # type: ignore
            0
        ]

        return await context.image_from_pil(upscaled_image)


class StableDiffusionXLBase(BaseNode):
    model: HFStableDiffusionXL = Field(
        default=HFStableDiffusionXL(),
        description="The Stable Diffusion XL model to use for generation.",
    )
    prompt: str = Field(default="", description="The prompt for image generation.")
    negative_prompt: str = Field(
        default="",
        description="The negative prompt to guide what should not appear in the generated image.",
    )
    seed: int = Field(
        default=-1,
        ge=-1,
        le=1000000,
        description="Seed for the random number generator.",
    )
    num_inference_steps: int = Field(
        default=25, ge=1, le=100, description="Number of inference steps."
    )
    guidance_scale: float = Field(
        default=7.0, ge=0.0, le=20.0, description="Guidance scale for generation."
    )
    width: int = Field(
        default=1024, ge=64, le=2048, description="Width of the generated image."
    )
    height: int = Field(
        default=1024, ge=64, le=2048, description="Height of the generated image"
    )
    scheduler: StableDiffusionScheduler = Field(
        default=StableDiffusionScheduler.DDIMScheduler,
        description="The scheduler to use for the diffusion process.",
    )
    lora_model: LORA_SDXL_Model = Field(
        default=LORA_SDXL_Model.NONE,
        description="The LORA model to use for image processing",
    )
    lora_scale: float = Field(
        default=0.5,
        ge=0.0,
        le=3.0,
        description="Strength of the LORA image",
    )
    ip_adapter_model: IPAdapter_SDXL_Model = Field(
        default=IPAdapter_SDXL_Model.NONE,
        description="The IP adapter model to use for image processing",
    )
    ip_adapter_image: ImageRef = Field(
        default=ImageRef(),
        description="When provided the image will be fed into the IP adapter",
    )
    ip_adapter_scale: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Strength of the IP adapter image",
    )

    _pipeline: Any = None

    @classmethod
    def get_recommended_models(cls) -> list[str]:
        return [
            HFStableDiffusionXL(
                repo_id="stabilityai/stable-diffusion-xl-base-1.0",
                allow_patterns=["**/*.fp16.safetensors", "**/*.json", "**/*.txt"],
            ),
            HFStableDiffusionXL(
                repo_id="stabilityai/stable-diffusion-xl-refiner-1.0",
                allow_patterns=["**/*.fp16.safetensors", "**/*.json", "**/*.txt"],
            ),
            HFStableDiffusionXL(
                repo_id="RunDiffusion/Juggernaut-XL-v9",
                allow_patterns=["**/*.fp16.safetensors", "**/*.json", "**/*.txt"],
            ),
            HFStableDiffusionXL(
                repo_id="fofr/sdxl-emoji",
                allow_patterns=["**/*.fp16.safetensors", "**/*.json", "**/*.txt"],
            ),
            HFIPAdapter(
                repo_id="h94/IP-Adapter",
                allow_patterns=[
                    "models/*.safetensors",
                ],
            ),
            HFLora(
                repo_id="danbrown/sdxl-lora",
                allow_patterns=[
                    "models/*.safetensors",
                ],
            ),
        ]

    @classmethod
    def is_visible(cls) -> bool:
        return cls is not StableDiffusionXLBase

    def _set_scheduler(self, scheduler_type: StableDiffusionScheduler):
        scheduler_class = get_scheduler_class(scheduler_type)
        self._pipeline.scheduler = scheduler_class.from_config(
            self._pipeline.scheduler.config
        )

    async def move_to_device(self, device: str):
        if self._pipeline is not None:
            self._pipeline.to(device)

    def _setup_generator(self):
        generator = torch.Generator(device="cpu")
        if self.seed != -1:
            generator = generator.manual_seed(self.seed)
        return generator

    async def _setup_ip_adapter(self, context: ProcessingContext):
        if self.ip_adapter_model != IPAdapter_SDXL_Model.NONE:
            if not context.is_huggingface_model_cached("h94/IP-Adapter"):
                raise ValueError(f"Model h94/IP-Adapter must be downloaded first")
            assert not self.ip_adapter_image.is_empty()
            self._load_ip_adapter()
            return await context.image_to_pil(self.ip_adapter_image)
        return None

    def _load_ip_adapter(self):
        if self.ip_adapter_model != IPAdapter_SDXL_Model.NONE:
            self._pipeline.load_ip_adapter(
                "h94/IP-Adapter",
                subfolder="sdxl_models",
                weight_name=self.ip_adapter_model.value,
            )

    def _load_lora(self):
        if self.lora_model != LORA_SDXL_Model.NONE:
            if not context.is_huggingface_model_cached(
                LORA_WEIGHTS[self.lora_model]["repo"]
            ):
                raise ValueError(
                    f"Model {LORA_WEIGHTS[self.lora_model]['repo']} must be downloaded first"
                )
            self._pipeline.load_lora_weights(
                LORA_WEIGHTS[self.lora_model]["repo"],
                weight_name=LORA_WEIGHTS[self.lora_model]["weight_name"],
                adapter_name=self.lora_model.value,
            )

    def progress_callback(self, context: ProcessingContext):
        def callback(step: int, timestep: int, latents: torch.FloatTensor) -> None:
            context.post_message(
                NodeProgress(
                    node_id=self.id,
                    progress=step,
                    total=self.num_inference_steps,
                )
            )

        return callback

    async def process(self, context: ProcessingContext) -> ImageRef:
        raise NotImplementedError("Subclasses must implement this method")


class StableDiffusionXL(StableDiffusionXLBase):
    """
    Generates images from text prompts using Stable Diffusion XL.
    image, generation, AI, text-to-image

    Use cases:
    - Creating custom illustrations for marketing materials
    - Generating concept art for game and film development
    - Producing unique stock imagery for websites and publications
    - Visualizing interior design concepts for clients
    """

    @classmethod
    def get_title(cls):
        return "Stable Diffusion XL"

    async def initialize(self, context: ProcessingContext):
        if self._pipeline is None:
            if not context.is_huggingface_model_cached(self.model.repo_id):
                raise ValueError(f"Model {self.model.repo_id} must be downloaded first")
            self._pipeline = StableDiffusionXLPipeline.from_pretrained(
                self.model.repo_id,
                torch_dtype=torch.float16,
                variant="fp16",
            )
            self._set_scheduler(self.scheduler)

    async def process(self, context) -> ImageRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        generator = self._setup_generator()
        self._load_lora()
        ip_adapter_image = await self._setup_ip_adapter(context)

        image = self._pipeline(
            prompt=self.prompt,
            negative_prompt=self.negative_prompt,
            num_inference_steps=self.num_inference_steps,
            guidance_scale=self.guidance_scale,
            width=self.width,
            height=self.height,
            ip_adapter_image=ip_adapter_image,
            ip_adapter_scale=self.ip_adapter_scale,
            cross_attention_kwargs={"scale": self.lora_scale},
            callback=self.progress_callback(context),
            callback_steps=1,
            generator=generator,
        ).images[0]

        return await context.image_from_pil(image)


# class StableDiffusionXLLightning(StableDiffusionXLBase):
#     """
#     Generates images from text prompts using Stable Diffusion XL in 4 steps.
#     image, generation, AI, text-to-image

#     Use cases:
#     - Creating custom illustrations for marketing materials
#     - Generating concept art for game and film development
#     - Producing unique stock imagery for websites and publications
#     - Visualizing interior design concepts for clients
#     """

#     num_inference_steps: int = Field(
#         default=4, ge=1, le=20, description="Number of inference steps."
#     )

#     _unet: UNet2DConditionModel | None = None

#     @classmethod
#     def get_title(cls):
#         return "Stable Diffusion XL Lightning"

#     async def initialize(self, context: ProcessingContext):
#         if not context.is_huggingface_model_cached(self.model.repo_id):
#             raise ValueError(f"Model {self.model.repo_id} must be downloaded first")
#         base = self.model.repo_id
#         self._unet = UNet2DConditionModel.from_config(base, subfolder="unet")  # type: ignore
#         ckpt = "sdxl_lightning_4step_unet.safetensors"
#         self._unet.load_state_dict(  # type: ignore
#             load_file(hf_hub_download("ByteDance/SDXL-Lightning", ckpt))
#         )
#         self._pipeline = StableDiffusionXLPipeline.from_pretrained(
#             base,
#             unet=self._unet,
#             torch_dtype=torch.float16,
#             variant="fp16",
#             local_files_only=True,
#         )

#         self._set_scheduler(self.scheduler)

#     async def move_to_device(self, device: str):
#         if self._pipeline is not None:
#             self._pipeline.to(device)
#         if self._unet is not None:
#             self._unet.to(device, torch.float16)

#     async def process(self, context) -> ImageRef:
#         if self._pipeline is None:
#             raise ValueError("Pipeline not initialized")

#         generator = self._setup_generator()
#         self._load_lora()
#         ip_adapter_image = await self._setup_ip_adapter(context)

#         image = self._pipeline(
#             prompt=self.prompt,
#             negative_prompt=self.negative_prompt,
#             num_inference_steps=self.num_inference_steps,
#             guidance_scale=self.guidance_scale,
#             width=self.width,
#             height=self.height,
#             ip_adapter_image=ip_adapter_image,
#             ip_adapter_scale=self.ip_adapter_scale,
#             cross_attention_kwargs={"scale": self.lora_scale},
#             callback=self.progress_callback(context),
#             callback_steps=1,
#             generator=generator,
#         ).images[0]

#         return await context.image_from_pil(image)


class StableDiffusionXLImg2Img(StableDiffusionXLBase):
    """
    Transforms existing images based on text prompts using Stable Diffusion XL.
    image, generation, AI, image-to-image

    Use cases:
    - Modifying existing images to fit a specific style or theme
    - Enhancing or altering stock photos for unique marketing materials
    - Transforming rough sketches into detailed illustrations
    - Creating variations of existing artwork or designs
    """

    init_image: ImageRef = Field(
        default=ImageRef(),
        description="The initial image for Image-to-Image generation.",
    )
    strength: float = Field(
        default=0.8,
        ge=0.0,
        le=1.0,
        description="Strength for Image-to-Image generation.",
    )

    def required_inputs(self):
        return ["init_image"]

    @classmethod
    def get_title(cls):
        return "Stable Diffusion XL (Img2Img)"

    async def initialize(self, context: ProcessingContext):
        if self._pipeline is None:
            if not context.is_huggingface_model_cached(self.model.repo_id):
                raise ValueError(f"Model {self.model.repo_id} must be downloaded first")
            self._pipeline = StableDiffusionXLImg2ImgPipeline.from_pretrained(
                self.model.repo_id,
                torch_dtype=torch.float16,
                variant="fp16",
            )
            self._set_scheduler(self.scheduler)

    async def process(self, context) -> ImageRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        self._load_lora()
        generator = self._setup_generator()
        init_image = await context.image_to_pil(self.init_image)
        init_image = init_image.resize((self.width, self.height))
        ip_adapter_image = await self._setup_ip_adapter(context)

        image = self._pipeline(
            prompt=self.prompt,
            image=init_image,
            negative_prompt=self.negative_prompt,
            num_inference_steps=self.num_inference_steps,
            strength=self.strength,
            guidance_scale=self.guidance_scale,
            cross_attention_kwargs={"scale": self.lora_scale},
            ip_adapter_image=ip_adapter_image,
            ip_adapter_scale=self.ip_adapter_scale,
            callback=self.progress_callback(context),
            callback_steps=1,
            generator=generator,
        ).images[0]

        return await context.image_from_pil(image)


class StableDiffusionXLInpainting(StableDiffusionXLBase):
    """
    Performs inpainting on images using Stable Diffusion XL.
    image, inpainting, AI, image-editing

    Use cases:
    - Removing unwanted objects from images
    - Adding new elements to existing images
    - Repairing damaged or incomplete images
    - Creating creative image edits and modifications
    """

    image: ImageRef = Field(
        default=ImageRef(),
        description="The input image to be inpainted.",
    )
    mask_image: ImageRef = Field(
        default=ImageRef(),
        description="The mask image indicating the area to be inpainted.",
    )
    strength: float = Field(
        default=0.99,
        ge=0.0,
        le=1.0,
        description="Strength of the inpainting. Values below 1.0 work best.",
    )

    def required_inputs(self):
        return ["image", "mask_image"]

    @classmethod
    def get_title(cls):
        return "Stable Diffusion XL (Inpainting)"

    @classmethod
    def get_recommended_models(cls) -> list[str]:
        return [
            HFStableDiffusionXL(
                repo_id="stabilityai/stable-diffusion-xl-inpainting-0.1",
                allow_patterns=["**/*.fp16.safetensors", "**/*.json", "**/*.txt"],
            )
        ]

    async def initialize(self, context: ProcessingContext):
        if self._pipeline is None:
            if not context.is_huggingface_model_cached(self.model.repo_id):
                raise ValueError(f"Model {self.model.repo_id} must be downloaded first")
            self._pipeline = AutoPipelineForInpainting.from_pretrained(
                "diffusers/stable-diffusion-xl-1.0-inpainting-0.1",
                torch_dtype=torch.float16,
                variant="fp16",
            )
            self._set_scheduler(self.scheduler)

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        generator = self._setup_generator()
        input_image = await context.image_to_pil(self.image)
        mask_image = await context.image_to_pil(self.mask_image)
        ip_adapter_image = await self._setup_ip_adapter(context)

        output = self._pipeline(
            prompt=self.prompt,
            image=input_image,
            mask_image=mask_image,
            negative_prompt=self.negative_prompt,
            num_inference_steps=self.num_inference_steps,
            guidance_scale=self.guidance_scale,
            strength=self.strength,
            cross_attention_kwargs={"scale": self.lora_scale},
            ip_adapter_image=ip_adapter_image,
            ip_adapter_scale=self.ip_adapter_scale,
            generator=generator,
            width=input_image.width,
            height=input_image.height,
            callback=self.progress_callback(context),
            callback_steps=1,
        )

        return await context.image_from_pil(output.images[0])


class StableDiffusionXLControlNetNode(StableDiffusionXLImg2Img):
    """
    Generates images using Stable Diffusion XL with ControlNet.
    image, generation, AI, text-to-image, controlnet

    Use cases:
    - Generate high-quality images with precise control over structures and features
    - Create variations of existing images while maintaining specific characteristics
    - Artistic image generation with guided outputs based on various control types
    """

    class StableDiffusionXLControlNetModel(str, Enum):
        CANNY = "diffusers/controlnet-canny-sdxl-1.0"
        DEPTH = "diffusers/controlnet-depth-sdxl-1.0"
        ZOE_DEPTH = "diffusers/controlnet-zoe-depth-sdxl-1.0"

    control_image: ImageRef = Field(
        default=ImageRef(),
        description="The control image to guide the generation process (already processed).",
    )
    control_model: StableDiffusionXLControlNetModel = Field(
        default=StableDiffusionXLControlNetModel.CANNY,
        description="The type of ControlNet model to use.",
    )
    controlnet_conditioning_scale: float = Field(
        default=0.5,
        description="The scale of the ControlNet conditioning.",
        ge=0.0,
        le=2.0,
    )

    def required_inputs(self):
        return ["control_image"]

    @classmethod
    def get_title(cls):
        return "Stable Diffusion XL ControlNet"

    _pipeline: StableDiffusionXLControlNetPipeline | None = None

    @classmethod
    def get_recommended_models(cls) -> list[str]:
        return [
            HFControlNet(
                repo_id="diffusers/controlnet-canny-sdxl-1.0",
                allow_patterns=["*.fp16.safetensors"],
            ),
            HFControlNet(
                repo_id="diffusers/controlnet-depth-sdxl-1.0",
                allow_patterns=["*.fp16.safetensors"],
            ),
            HFControlNet(
                repo_id="diffusers/controlnet-zoe-depth-sdxl-1.0",
                allow_patterns=["*.fp16.safetensors"],
            ),
        ]

    async def initialize(self, context: ProcessingContext):
        if not context.is_huggingface_model_cached(self.control_model.value):
            raise ValueError(
                f"ControlNet model {self.control_model.value} must be downloaded first"
            )
        if not context.is_huggingface_model_cached(self.model.repo_id):
            raise ValueError(f"Model {self.model.repo_id} must be downloaded first")

        controlnet = ControlNetModel.from_pretrained(
            self.control_model.value, torch_dtype=torch.float16
        )
        self._pipeline = StableDiffusionXLControlNetPipeline.from_pretrained(
            self.model.repo_id,
            controlnet=controlnet,
            torch_dtype=torch.float16,
            local_files_only=True,
        )  # type: ignore

        self._set_scheduler(self.scheduler)

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        self._load_lora()
        generator = self._setup_generator()

        control_image = await context.image_to_pil(self.control_image)

        if not self.init_image.is_empty():
            init_image = await context.image_to_pil(self.init_image)
            init_image = init_image.resize((self.width, self.height))
        else:
            init_image = None

        ip_adapter_image = await self._setup_ip_adapter(context)

        output = self._pipeline(
            prompt=self.prompt,
            negative_prompt=self.negative_prompt,
            init_image=init_image,
            image=control_image,
            strength=self.strength,
            ip_adapter_image=ip_adapter_image,
            ip_adapter_scale=self.ip_adapter_scale,
            cross_attention_kwargs={"scale": self.lora_scale},
            controlnet_conditioning_scale=self.controlnet_conditioning_scale,
            num_inference_steps=self.num_inference_steps,
            generator=generator,
            callback=self.progress_callback(context),
            callback_steps=1,
        )

        return await context.image_from_pil(output.images[0])  # type: ignore


class SDXLTurbo(BaseNode):
    """
    Generates images from text prompts using SDXL Turbo.
    image, generation, AI, text-to-image, fast

    Use cases:
    - Rapid prototyping of visual concepts
    - Real-time image generation for interactive applications
    - Quick visualization of ideas for brainstorming sessions
    - Creating multiple variations of an image concept quickly
    """

    model: HFStableDiffusionXLTurbo = Field(
        default=HFStableDiffusionXLTurbo(),
        description="The SDXL Turbo model to use for generation.",
    )
    prompt: str = Field(default="", description="The prompt for image generation.")
    seed: int = Field(
        default=-1,
        ge=-1,
        le=1000000,
        description="Seed for the random number generator.",
    )
    num_inference_steps: int = Field(
        default=1, ge=1, le=50, description="Number of inference steps."
    )
    guidance_scale: float = Field(
        default=0.0, ge=0.0, le=20.0, description="Guidance scale for generation."
    )
    width: int = Field(
        default=1024, ge=64, le=2048, description="Width of the generated image."
    )
    height: int = Field(
        default=1024, ge=64, le=2048, description="Height of the generated image"
    )

    _pipe: Any = None

    @classmethod
    def get_title(cls):
        return "SDXL Turbo"

    @classmethod
    def get_recommended_models(cls) -> list[str]:
        return [
            HFStableDiffusionXLTurbo(
                repo_id="stabilityai/sdxl-turbo",
                allow_patterns=["**/*.fp16.safetensors", "**/*.json", "**/*.txt"],
            ),
            HFStableDiffusionXLTurbo(
                repo_id="Lykon/dreamshaper-xl-v2-turbo",
                allow_patterns=["**/*.fp16.safetensors", "**/*.json", "**/*.txt"],
            ),
        ]

    async def initialize(self, context: ProcessingContext):
        if self._pipe is None:
            if not context.is_huggingface_model_cached(self.model.repo_id):
                raise ValueError(f"Model {self.model.repo_id} must be downloaded first")
            self._pipe = AutoPipelineForText2Image.from_pretrained(
                self.model.repo_id,
                torch_dtype=torch.float16,
                variant="fp16",
                local_files_only=True,
            )

    async def move_to_device(self, device: str):
        if self._pipe is not None:
            self._pipe.to(device)

    async def process(self, context) -> ImageRef:
        if self._pipe is None:
            raise ValueError("Pipeline not initialized")

        # Set up the generator for reproducibility
        generator = torch.Generator(device="cpu")
        if self.seed != -1:
            generator = generator.manual_seed(self.seed)

        image = self._pipe(
            prompt=self.prompt,
            num_inference_steps=self.num_inference_steps,
            guidance_scale=self.guidance_scale,
            width=self.width,
            height=self.height,
            callback=progress_callback(self.id, self.num_inference_steps, context),
            callback_steps=1,
            generator=generator,
        ).images[0]

        return await context.image_from_pil(image)


class SDXLTurboImg2Img(BaseNode):
    """
    Transforms existing images based on text prompts using SDXL Turbo.
    image, generation, AI, image-to-image

    Use cases:
    - Modifying existing images to fit a specific style or theme
    - Enhancing or altering stock photos for unique marketing materials
    - Transforming rough sketches into detailed illustrations
    - Creating variations of existing artwork or designs
    """

    model: HFStableDiffusionXLTurbo = Field(
        default=HFStableDiffusionXLTurbo(),
        description="The SDXL Turbo model to use for generation.",
    )
    prompt: str = Field(default="", description="The prompt for image generation.")
    init_image: ImageRef = Field(
        default=ImageRef(),
        description="The initial image for Image-to-Image generation.",
    )
    seed: int = Field(
        default=-1,
        ge=-1,
        le=1000000,
        description="Seed for the random number generator.",
    )
    num_inference_steps: int = Field(
        default=4, ge=1, le=50, description="Number of inference steps."
    )
    guidance_scale: float = Field(
        default=0.0, ge=0.0, le=20.0, description="Guidance scale for generation."
    )
    width: int = Field(
        default=1024, ge=64, le=2048, description="Width of the generated image."
    )
    height: int = Field(
        default=1024, ge=64, le=2048, description="Height of the generated image"
    )
    strength: float = Field(
        default=0.8,
        ge=0.0,
        le=1.0,
        description="Strength for Image-to-Image generation.",
    )

    _pipe: Any = None

    @classmethod
    def get_recommended_models(cls) -> list[str]:
        return [
            HFStableDiffusionXLTurbo(
                repo_id="stabilityai/sdxl-turbo",
                allow_patterns=["**/*.fp16.safetensors", "**/*.json", "**/*.txt"],
            ),
            HFStableDiffusionXLTurbo(
                repo_id="Lykon/dreamshaper-xl-v2-turbo",
                allow_patterns=["**/*.fp16.safetensors", "**/*.json", "**/*.txt"],
            ),
        ]

    def required_inputs(self):
        return ["init_image"]

    @classmethod
    def get_title(cls):
        return "SD XL Turbo (Img2Img)"

    async def initialize(self, context: ProcessingContext):
        if self._pipe is None:
            if not context.is_huggingface_model_cached(self.model.repo_id):
                raise ValueError(f"Model {self.model.repo_id} must be downloaded first")
            self._pipe = AutoPipelineForImage2Image.from_pretrained(
                self.model.repo_id,
                torch_dtype=torch.float16,
                variant="fp16",
            )

    async def move_to_device(self, device: str):
        if self._pipe is not None:
            self._pipe.to(device)

    async def process(self, context) -> ImageRef:
        if self._pipe is None:
            raise ValueError("Pipeline not initialized")

        # Set up the generator for reproducibility
        generator = torch.Generator(device="cpu")
        if self.seed != -1:
            generator = generator.manual_seed(self.seed)

        init_image = await context.image_to_pil(self.init_image)
        init_image = init_image.resize((self.width, self.height))

        image = self._pipe(
            prompt=self.prompt,
            image=init_image,
            num_inference_steps=self.num_inference_steps,
            strength=self.strength,
            guidance_scale=self.guidance_scale,
            callback=progress_callback(self.id, self.num_inference_steps, context),
            callback_steps=1,
            generator=generator,
        ).images[0]

        return await context.image_from_pil(image)


class StableDiffusionXLControlNetNode(StableDiffusionXLImg2Img):
    """
    Generates images using Stable Diffusion XL with ControlNet.
    image, generation, AI, text-to-image, controlnet

    Use cases:
    - Generate high-quality images with precise control over structures and features
    - Create variations of existing images while maintaining specific characteristics
    - Artistic image generation with guided outputs based on various control types
    """

    class StableDiffusionXLControlNetModel(str, Enum):
        CANNY = "diffusers/controlnet-canny-sdxl-1.0"
        DEPTH = "diffusers/controlnet-depth-sdxl-1.0"
        POSE = "diffusers/controlnet-openpose-sdxl-1.0"
        NORMAL = "diffusers/controlnet-normal-sdxl-1.0"

    control_image: ImageRef = Field(
        default=ImageRef(),
        description="The control image to guide the generation process (already processed).",
    )
    control_model: StableDiffusionXLControlNetModel = Field(
        default=StableDiffusionXLControlNetModel.CANNY,
        description="The type of ControlNet model to use.",
    )
    controlnet_conditioning_scale: float = Field(
        default=0.5,
        description="The scale of the ControlNet conditioning.",
        ge=0.0,
        le=2.0,
    )

    def required_inputs(self):
        return ["control_image"]

    @classmethod
    def get_title(cls):
        return "Stable Diffusion XL ControlNet"

    _pipeline: StableDiffusionXLControlNetPipeline | None = None

    async def initialize(self, context: ProcessingContext):
        if not context.is_huggingface_model_cached(self.control_model.value):
            raise ValueError(
                f"ControlNet model {self.control_model.value} must be downloaded first"
            )
        if not context.is_huggingface_model_cached(self.model.repo_id):
            raise ValueError(f"Model {self.model.repo_id} must be downloaded first")

        controlnet = ControlNetModel.from_pretrained(
            self.control_model.value, torch_dtype=torch.float16
        )
        vae = AutoencoderKL.from_pretrained(
            "madebyollin/sdxl-vae-fp16-fix", torch_dtype=torch.float16
        )
        self._pipeline = StableDiffusionXLControlNetPipeline.from_pretrained(
            self.model.repo_id,
            controlnet=controlnet,
            vae=vae,
            torch_dtype=torch.float16,
        )  # type: ignore

        self._set_scheduler(self.scheduler)

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        self._load_lora()
        generator = self._setup_generator()

        control_image = await context.image_to_pil(self.control_image)

        if not self.init_image.is_empty():
            init_image = await context.image_to_pil(self.init_image)
            init_image = init_image.resize((self.width, self.height))
        else:
            init_image = None

        ip_adapter_image = await self._setup_ip_adapter(context)

        output = self._pipeline(
            prompt=self.prompt,
            negative_prompt=self.negative_prompt,
            init_image=init_image,
            image=control_image,
            strength=self.strength,
            ip_adapter_image=ip_adapter_image,
            ip_adapter_scale=self.ip_adapter_scale,
            cross_attention_kwargs={"scale": self.lora_scale},
            controlnet_conditioning_scale=self.controlnet_conditioning_scale,
            num_inference_steps=self.num_inference_steps,
            generator=generator,
            callback=self.progress_callback(context),
            callback_steps=1,
        )

        return await context.image_from_pil(output.images[0])  # type: ignore


class LatentConsistencyModel(StableDiffusionXLBase):
    """
    Generates images using the Latent Consistency Model.
    image, generation, AI, diffusion

    Use cases:
    - Create AI-generated art and illustrations
    - Produce concept art for creative projects
    - Generate visual content for various applications
    - Explore AI-assisted image creation
    """

    num_inference_steps: int = Field(
        default=4,
        description="Number of denoising steps. LCM supports fast inference even with <=4 steps. Recommended: 1-8 steps.",
        ge=1,
        le=50,
    )

    _unet: UNet2DConditionModel | None = None
    _pipeline: DiffusionPipeline | None = None

    @classmethod
    def get_title(cls):
        return "Latent Consistency Model"

    @classmethod
    def get_recommended_models(cls) -> list[str]:
        return [
            HFStableDiffusionXLTurbo(
                repo_id="latent-consistency/lcm-sdxl",
                allow_patterns=["**/*.fp16.safetensors", "**/*.json", "**/*.txt"],
            )
        ]

    async def initialize(self, context: ProcessingContext):
        self._unet = UNet2DConditionModel.from_pretrained(
            "latent-consistency/lcm-sdxl", torch_dtype=torch.float16, variant="fp16"
        )  # type: ignore
        self._pipeline = DiffusionPipeline.from_pretrained(
            self.model.repo_id,
            unet=self._unet,
            torch_dtype=torch.float16,
            variant="fp16",
        )
        self._set_scheduler(self.scheduler)
        self._pipeline.scheduler = LCMScheduler.from_config(self._pipeline.scheduler.config)  # type: ignore

    async def move_to_device(self, device: str):
        if self._pipeline is not None:
            self._pipeline.to(device, dtype=torch.float16)

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        generator = self._setup_generator()
        self._load_lora()
        ip_adapter_image = await self._setup_ip_adapter(context)

        def progress_callback(
            step: int, timestep: int, latents: torch.FloatTensor
        ) -> None:
            context.post_message(
                NodeProgress(
                    node_id=self.id,
                    progress=step,
                    total=self.num_inference_steps,
                )
            )

        image = self._pipeline(
            prompt=self.prompt,
            width=self.width,
            height=self.height,
            ip_adapter_image=ip_adapter_image,
            num_inference_steps=self.num_inference_steps,
            guidance_scale=self.guidance_scale,
            generator=generator,
            callback=progress_callback,
            callback_steps=1,
        ).images[  # type: ignore
            0
        ]

        return await context.image_from_pil(image)
