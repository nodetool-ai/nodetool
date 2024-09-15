from enum import Enum
import numpy as np
import PIL.Image
from nodetool.model_manager import ModelManager
from nodetool.metadata.types import (
    BoundingBox,
    HFControlNet,
    HFIPAdapter,
    HFImageClassification,
    HFImageFeatureExtraction,
    HFImageToImage,
    HFLoraSD,
    HFLoraSDXL,
    HFStableDiffusion,
    HFStableDiffusionUpscale,
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
    Tensor,
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
from diffusers import StableDiffusionXLInpaintPipeline  # type: ignore
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
from transformers import ImageClassificationPipeline  # type: ignore
from transformers import ImageSegmentationPipeline  # type: ignore
import PIL.Image
import PIL.ImageDraw
import PIL.ImageFont
from huggingface_hub import try_to_load_from_cache


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


HF_LORA_SD_MODELS = [
    HFLoraSD(repo_id="danbrown/loras", path="2d_sprite.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="ghibli_scenery.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="add_detail.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="colorwater.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="sxz_game_assets.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="3Danaglyph.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="akiratoriyama_style.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="animeoutlineV4.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="aqua_konosuba.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="arakihirohiko_style.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="arcane_style.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="canetaazul.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="cyberpunk_tarot.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="discoelysium_style.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="esdeath_akamegakill.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="fire_vfx.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="flamingeye.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="funnycreatures.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="gacha_splash.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="gigachad.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="gyokai_style.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="harold.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="hiderohoribes_style.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="ilyakuvshinov_style.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="jacksparrow.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="jimlee_style.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="komowataharuka_chibiart.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="lightning_vfx.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="lucy_cyberpunk.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="luisap_pixelart.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="mumei_kabaneri.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="myheroacademia_style.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="neoartcore.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="ochakouraraka.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="onepiece_style.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="paimon_genshinimpact.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="peanutscomics_style.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="pepefrog.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="persona5_portraits.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="persona5_style.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="pixhell.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="princesszelda.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="satoshiuruchihara_style.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="shinobu_demonslayer.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="sokolov_style.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="standingbackgroundv1.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="sun_shadow_style.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="thickeranimelines.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="threesidedview.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="twitch_emotes.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="water_vfx.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="wlop_style.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="zerotwo_darling.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="2d_sprite.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="ghibli_scenery.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="add_detail.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="colorwater.safetensors"),
    HFLoraSD(repo_id="danbrown/loras", path="sxz_game_assets.safetensors"),
]

HF_LORA_SDXL_MODELS = [
    HFLoraSDXL(repo_id="CiroN2022/toy-face", path="toy_face_sdxl.safetensors"),
    HFLoraSDXL(repo_id="nerijs/pixel-art-xl", path="pixel-art-xl.safetensors"),
    HFLoraSDXL(
        repo_id="goofyai/3d_render_style_xl", path="3d_render_style_xl.safetensors"
    ),
    HFLoraSDXL(
        repo_id="artificialguybr/CuteCartoonRedmond-V2",
        path="CuteCartoonRedmond-CuteCartoon-CuteCartoonAF.safetensors",
    ),
    HFLoraSDXL(
        repo_id="blink7630/graphic-novel-illustration",
        path="Graphic_Novel_Illustration-000007.safetensors",
    ),
    HFLoraSDXL(
        repo_id="robert123231/coloringbookgenerator",
        path="ColoringBookRedmond-ColoringBook-ColoringBookAF.safetensors",
    ),
    HFLoraSDXL(
        repo_id="Linaqruf/anime-detailer-xl-lora",
        path="anime-detailer-xl-lora.safetensors",
    ),
]

HF_STABLE_DIFFUSION_MODELS = [
    HFStableDiffusion(
        repo_id="Yntec/Deliberate2",
        path="Deliberate_v2.safetensors",
    ),
    HFStableDiffusion(
        repo_id="Yntec/epiCPhotoGasm", path="epiCPhotoGasmVAE.safetensors"
    ),
    HFStableDiffusion(repo_id="Yntec/epiCEpic", path="epiCEpic.safetensors"),
    HFStableDiffusion(repo_id="Yntec/VisionVision", path="VisionVision.safetensors"),
    HFStableDiffusion(
        repo_id="Yntec/AbsoluteReality",
        path="absolutereality_v16.safetensors",
    ),
    HFStableDiffusion(
        repo_id="Yntec/realistic-vision-v13",
        path="Realistic_Vision_V1.3.safetensors",
    ),
    HFStableDiffusion(
        repo_id="Yntec/realisticStockPhoto3",
        path="realisticStockPhoto_v30SD15.safetensors",
    ),
    HFStableDiffusion(
        repo_id="Yntec/HyperRemix",
        path="HyperRemix.safetensors",
    ),
    HFStableDiffusion(
        repo_id="Yntec/HyperPhotoGASM",
        path="HyperPhotoGASM.safetensors",
    ),
    HFStableDiffusion(
        repo_id="Yntec/ZootVision", path="zootvisionAlpha_v10Alpha.safetensors"
    ),
    HFStableDiffusion(repo_id="Yntec/ChunkyCat", path="ChunkyCat.safetensors"),
    HFStableDiffusion(
        repo_id="Yntec/TickleYourFancy",
        path="TickleYourFancy.safetensors",
    ),
    HFStableDiffusion(
        repo_id="Yntec/AllRoadsLeadToRetro",
        path="AllRoadsLeadToRetro.safetensors",
    ),
    HFStableDiffusion(repo_id="Yntec/ClayStyle", path="ClayStyle.safetensors"),
    HFStableDiffusion(repo_id="Yntec/epiCDream", path="epicdream_lullaby.safetensors"),
    HFStableDiffusion(
        repo_id="Yntec/Epsilon_Naught",
        path="Epsilon_Naught.safetensors",
    ),
    HFStableDiffusion(
        repo_id="Yntec/BetterPonyDiffusion",
        path="betterPonyDiffusionV6_v20.safetensors",
    ),
    HFStableDiffusion(
        repo_id="Yntec/ZootVisionEpsilon",
        path="zootvisionEpsilon_v50Epsilon.safetensors",
    ),
    HFStableDiffusion(
        repo_id="Yntec/RevAnimatedV2Rebirth",
        path="revAnimated_v2RebirthVAE.safetensors",
    ),
    HFStableDiffusion(
        repo_id="Yntec/AnimephilesAnonymous",
        path="AnimephilesAnonymous.safetensors",
    ),
    HFStableDiffusion(
        repo_id="Yntec/InsaneSurreality",
        path="InsaneSurreality.safetensors",
    ),
    HFStableDiffusion(
        repo_id="Yntec/DreamlikePhotoReal2",
        path="DreamlikePhotoReal2.safetensors",
    ),
    HFStableDiffusion(
        repo_id="Yntec/DreamShaperRemix",
        path="DreamShaperRemix.safetensors",
    ),
    HFStableDiffusion(
        repo_id="Yntec/CrystalReality",
        path="CrystalReality.safetensors",
    ),
    HFStableDiffusion(
        repo_id="Yntec/ZooFun",
        path="ZooFun.safetensors",
    ),
    HFStableDiffusion(
        repo_id="Yntec/DreamWorks",
        path="DreamWorks.safetensors",
    ),
    HFStableDiffusion(
        repo_id="Yntec/ICantBelieveItSNotPhotography",
        path="icbinpICantBelieveIts_v10_pruned.safetensors",
    ),
    HFStableDiffusion(repo_id="Yntec/fennPhoto", path="fennPhoto_v10.safetensors"),
    HFStableDiffusion(
        repo_id="Yntec/Surreality",
        path="ChainGirl-Surreality.safetensors",
    ),
    HFStableDiffusion(
        repo_id="Yntec/WinningBlunder",
        path="WinningBlunder.safetensors",
    ),
    HFStableDiffusion(
        repo_id="Yntec/beLIEve",
        path="beLIEve.safetensors",
    ),
    HFStableDiffusion(
        repo_id="Yntec/Neurogen",
        path="NeurogenVAE.safetensors",
    ),
    HFStableDiffusion(
        repo_id="Yntec/Hyperlink",
        path="Hyperlink.safetensors",
    ),
    HFStableDiffusion(
        repo_id="Yntec/Disneyify",
        path="Disneyify_v1.safetensors",
    ),
    HFStableDiffusion(
        repo_id="Yntec/DisneyPixarCartoon768",
        path="disneyPixarCartoonVAE.safetensors",
    ),
    HFStableDiffusion(
        repo_id="Yntec/Wonder",
        path="Wonder.safetensors",
    ),
    HFStableDiffusion(
        repo_id="Yntec/Voxel",
        path="VoxelVAE.safetensors",
    ),
    HFStableDiffusion(
        repo_id="Yntec/Vintage",
        path="Vintage.safetensors",
    ),
    HFStableDiffusion(
        repo_id="Yntec/BeautyFoolRemix",
        path="BeautyFoolRemix.safetensors",
    ),
    HFStableDiffusion(
        repo_id="Yntec/handpaintedRPGIcons",
        path="handpaintedRPGIcons_v1.safetensors",
    ),
    HFStableDiffusion(repo_id="Yntec/526Mix", path="526mixV15.safetensors"),
    HFStableDiffusion(repo_id="Yntec/majicmixLux", path="majicmixLux_v1.safetensors"),
    HFStableDiffusion(
        repo_id="Yntec/incha_re_zoro", path="inchaReZoro_v10.safetensors"
    ),
    HFStableDiffusion(
        repo_id="Yntec/3DCartoonVision", path="3dCartoonVision_v10.safetensors"
    ),
    HFStableDiffusion(
        repo_id="Yntec/Disneyify",
        path="Disneyify.safetensors",
    ),
    HFStableDiffusion(repo_id="Yntec/RetroRetro", path="RetroRetro.safetensors"),
    HFStableDiffusion(repo_id="Yntec/ClassicToons", path="ClassicToons.safetensors"),
    HFStableDiffusion(repo_id="Yntec/PixelKicks", path="PixelKicks.safetensors"),
    HFStableDiffusion(
        repo_id="Yntec/NostalgicLife", path="NostalgicLifeVAE.safetensors"
    ),
    HFStableDiffusion(
        repo_id="Yntec/ArthemyComics",
        path="arthemyComics_v10Bakedvae.safetensors",
    ),
    HFStableDiffusion(repo_id="Yntec/Paramount", path="Paramount.safetensors"),
]

HF_STABLE_DIFFUSION_XL_MODELS = [
    HFStableDiffusionXL(
        repo_id="stabilityai/stable-diffusion-xl-base-1.0",
        path="sd_xl_base_1.0.safetensors",
    ),
    HFStableDiffusionXL(
        repo_id="stabilityai/stable-diffusion-xl-refiner-1.0",
        path="sd_xl_refiner_1.0.safetensors",
    ),
    HFStableDiffusionXL(
        repo_id="RunDiffusion/Juggernaut-XL-v9",
        path="Juggernaut-XL_v9_RunDiffusionPhoto_v2.safetensors",
    ),
    HFStableDiffusionXL(
        repo_id="dataautogpt3/ProteusV0.5",
        path="proteusV0.5.safetensors",
    ),
    HFStableDiffusionXL(
        repo_id="Lykon/dreamshaper-xl-lightning",
        path="DreamShaperXL_Lightning.safetensors",
    ),
    HFStableDiffusionXL(
        repo_id="fofr/sdxl-emoji",
    ),
    HFStableDiffusionXL(
        repo_id="stabilityai/sdxl-turbo", path="sd_xl_turbo_1.0_fp16.safetensors"
    ),
    HFStableDiffusionXL(
        repo_id="Lykon/dreamshaper-xl-v2-turbo",
        path="DreamShaperXL_Turbo_v2_1.safetensors",
    ),
]


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
    image: ImageRef = Field(
        default=ImageRef(),
        title="Image",
        description="The input image to classify",
    )
    _pipeline: ImageClassificationPipeline | None = None

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
        return ["image"]

    def get_model_id(self):
        return self.model.repo_id

    @classmethod
    def get_title(cls) -> str:
        return "Image Classifier"

    async def move_to_device(self, device: str):
        if self._pipeline is not None:
            self._pipeline.model.to(device)  # type: ignore

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_pipeline(
            context, "image-classification", self.get_model_id(), device=context.device
        )

    async def process(self, context: ProcessingContext) -> dict[str, float]:
        image = await context.image_to_pil(self.image)
        result = self._pipeline(image)  # type: ignore
        return {str(item["label"]): float(item["score"]) for item in result}  # type: ignore


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
    image: ImageRef = Field(
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
        return ["image"]

    @classmethod
    def get_title(cls) -> str:
        return "Zero-Shot Image Classifier"

    def get_model_id(self):
        return self.model.repo_id

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_pipeline(
            context=context,
            pipeline_task="zero-shot-image-classification",
            model_id=self.get_model_id(),
            device=context.device,
        )

    async def move_to_device(self, device: str):
        if self._pipeline is not None:
            self._pipeline.model.to(device)  # type: ignore

    async def process(self, context: ProcessingContext) -> dict[str, float]:
        image = await context.image_to_pil(self.image)
        result = self._pipeline(
            image, candidate_labels=self.candidate_labels.split(",")
        )  # type: ignore
        return {str(item["label"]): float(item["score"]) for item in result}  # type: ignore


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

    _pipeline: ImageSegmentationPipeline | None = None

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

    @classmethod
    def get_title(cls) -> str:
        return "Image Segmentation"

    async def move_to_device(self, device: str):
        if self._pipeline is not None:
            self._pipeline.model.to(device)

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_pipeline(
            context, "image-segmentation", self.get_model_id(), device=context.device
        )

    async def process(
        self, context: ProcessingContext
    ) -> list[ImageSegmentationResult]:
        assert self._pipeline is not None

        image = await context.image_to_pil(self.image)
        result = self._pipeline(image)

        async def convert_output(item: dict[str, Any]):
            mask = await context.image_from_pil(item["mask"])
            return ImageSegmentationResult(mask=mask, label=item["label"])

        return await asyncio.gather(*[convert_output(item) for item in result])


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
    image: ImageRef = Field(
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
        return ["image"]

    @classmethod
    def get_title(cls) -> str:
        return "Object Detection"

    def get_model_id(self):
        return self.model.repo_id

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_pipeline(
            context, "object-detection", self.get_model_id(), device=context.device
        )

    async def move_to_device(self, device: str):
        if self._pipeline is not None:
            self._pipeline.model.to(device)  # type: ignore

    async def process(self, context: ProcessingContext) -> list[ObjectDetectionResult]:
        assert self._pipeline is not None
        image = await context.image_to_pil(self.image)
        result = self._pipeline(image, threshold=self.threshold)
        if isinstance(result, list):
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
        else:
            raise ValueError(f"Invalid result type: {type(result)}")


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
    image: ImageRef = Field(
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
        return ["image"]

    @classmethod
    def get_title(cls) -> str:
        return "Zero-Shot Object Detection"

    def get_model_id(self):
        return self.model.repo_id

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_pipeline(
            context,
            "zero-shot-object-detection",
            self.get_model_id(),
            device=context.device,
        )

    async def move_to_device(self, device: str):
        if self._pipeline is not None:
            self._pipeline.model.to(device)  # type: ignore

    async def process(self, context: ProcessingContext) -> list[ObjectDetectionResult]:
        assert self._pipeline is not None
        image = await context.image_to_pil(self.image)
        result = self._pipeline(
            image,
            candidate_labels=self.candidate_labels.split(","),
            threshold=self.threshold,
        )
        return [
            ObjectDetectionResult(
                label=item.label,  # type: ignore
                score=item.score,  # type: ignore
                box=BoundingBox(
                    xmin=item.box.xmin,  # type: ignore
                    ymin=item.box.ymin,  # type: ignore
                    xmax=item.box.xmax,  # type: ignore
                    ymax=item.box.ymax,  # type: ignore
                ),
            )
            for item in result  # type: ignore
        ]


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
    image: ImageRef = Field(
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
        return ["image"]

    @classmethod
    def get_title(cls) -> str:
        return "Depth Estimation"

    def get_model_id(self):
        return self.model.repo_id

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_pipeline(
            context, "depth-estimation", self.get_model_id(), device=context.device
        )

    async def move_to_device(self, device: str):
        if self._pipeline is not None:
            self._pipeline.model.to(device)  # type: ignore

    async def process(self, context: ProcessingContext) -> ImageRef:
        assert self._pipeline is not None
        image = await context.image_to_pil(self.image)
        result = self._pipeline(image)
        depth_map = result["depth"]  # type: ignore
        return await context.image_from_pil(depth_map)  # type: ignore


class BaseImageToImage(HuggingFacePipelineNode):
    """
    Base class for image-to-image transformation tasks.
    image, transformation, generation, huggingface
    """

    @classmethod
    def is_visible(cls) -> bool:
        return cls is not BaseImageToImage

    image: ImageRef = Field(
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
        return ["image"]

    def get_model_id(self):
        raise NotImplementedError("Subclass must implement abstract method")

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_pipeline(
            context, "image-to-image", self.get_model_id(), device=context.device
        )

    async def move_to_device(self, device: str):
        if self._pipeline is not None:
            self._pipeline.model.to(device)  # type: ignore

    async def process(self, context: ProcessingContext) -> ImageRef:
        image = await context.image_to_pil(self.image)
        result = self._pipeline(image, prompt=self.prompt)  # type: ignore
        return await context.image_from_pil(result)  # type: ignore


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


class PixArtAlpha(HuggingFacePipelineNode):
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
            HFImageToImage(
                repo_id="PixArt-alpha/PixArt-XL-2-1024-MS",
            ),
        ]

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_model(
            context=context,
            model_id="PixArt-alpha/PixArt-XL-2-1024-MS",
            model_class=PixArtAlphaPipeline,
            variant=None,
        )

    async def move_to_device(self, device: str):
        if self._pipeline is not None:
            self._pipeline.to(device)

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        # Set up the generator for reproducibility
        generator = None
        if self.seed != -1:
            generator = torch.Generator(device="cpu").manual_seed(self.seed)

        def callback(step: int, timestep: int, latents: torch.Tensor) -> None:
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
            width=self.width,
            height=self.height,
            generator=generator,
            callback=callback,
            callback_steps=1,
        )

        image = output.images[0]  # type: ignore

        return await context.image_from_pil(image)


class PixArtSigma(HuggingFacePipelineNode):
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
            HFImageToImage(
                repo_id="PixArt-alpha/PixArt-Sigma-XL-2-1024-MS",
            ),
        ]

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_model(
            context=context,
            model_id="PixArt-alpha/PixArt-Sigma-XL-2-1024-MS",
            model_class=PixArtAlphaPipeline,
            variant=None,
        )

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        # Set up the generator for reproducibility
        generator = None
        if self.seed != -1:
            generator = torch.Generator(device="cpu").manual_seed(self.seed)

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
            width=self.width,
            height=self.height,
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


class Kandinsky3(HuggingFacePipelineNode):
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

    def get_model_id(self):
        return "kandinsky-community/kandinsky-3"

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_model(
            context=context,
            model_id="kandinsky-community/kandinsky-3",
            model_class=AutoPipelineForText2Image,
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
        generator = None
        if self.seed != -1:
            generator = torch.Generator(device="cpu").manual_seed(self.seed)

        self._pipeline.enable_sequential_cpu_offload()

        # Generate the image
        output = self._pipeline(
            prompt=self.prompt,
            num_inference_steps=self.num_inference_steps,
            generator=generator,
            width=self.width,
            height=self.height,
            callback=progress_callback(self.id, self.num_inference_steps, context),
            callback_steps=1,
        )  # type: ignore

        image = output.images[0]  # type: ignore

        return await context.image_from_pil(image)


class Kandinsky3Img2Img(HuggingFacePipelineNode):
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
        self._pipeline = await self.load_model(
            context=context,
            model_id="kandinsky-community/kandinsky-3",
            model_class=AutoPipelineForImage2Image,
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


class PlaygroundV2(HuggingFacePipelineNode):
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

    lora_model: HFLoraSD = Field(
        default=HFLoraSD(),
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

    def _load_ip_adapter(self):
        if self.ip_adapter_model != IPAdapter_SD15_Model.NONE:
            cache_path = try_to_load_from_cache(
                "h94/IP-Adapter", f"models/{self.ip_adapter_model.value}"
            )
            if cache_path is None:
                raise ValueError(
                    f"Install the h94/IP-Adapter model to use it (Recommended Models above)"
                )
            assert self._pipeline is not None
            self._pipeline.load_ip_adapter(
                "h94/IP-Adapter",
                subfolder="models",
                weight_name=self.ip_adapter_model,
            )
            self._pipeline.set_ip_adapter_scale(self.ip_adapter_scale)

    async def _load_lora(self, context: ProcessingContext):
        if self.lora_model.repo_id != "" and self.lora_model.path:
            cache_path = try_to_load_from_cache(
                self.lora_model.repo_id,
                self.lora_model.path,
            )
            if cache_path is None:
                raise ValueError(
                    f"Install {self.lora_model.repo_id}/{self.lora_model.path} LORA to use it (Recommended Models above)"
                )
            assert self._pipeline is not None
            self._pipeline.load_lora_weights(
                cache_path,
                weight_name=self.lora_model.path,
                adapter_name="default",
            )

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_model(
            context=context,
            model_id="playgroundai/playground-v2.5-1024px-aesthetic",
            model_class=DiffusionPipeline,
        )
        await self._load_lora(context)

    async def move_to_device(self, device: str):
        if self._pipeline is not None:
            self._pipeline.to(device)

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        # Set up the generator for reproducibility
        generator = torch.Generator(device="cpu")
        if self.seed != -1:
            generator = generator.manual_seed(self.seed)

        ip_adapter_image = (
            await context.image_to_pil(self.ip_adapter_image)
            if self.ip_adapter_image.is_set()
            else None
        )

        output = self._pipeline(
            prompt=self.prompt,
            num_inference_steps=self.num_inference_steps,
            generator=generator,
            width=self.width,
            height=self.height,
            callback=progress_callback(self.id, self.num_inference_steps, context),
            callback_steps=1,
            ip_adapter_image=ip_adapter_image,
            ip_adapter_scale=self.ip_adapter_scale,
            cross_attention_kwargs={"scale": self.lora_scale},
        )  # type: ignore

        image = output.images[0]

        return await context.image_from_pil(image)


class StableDiffusionBaseNode(HuggingFacePipelineNode):
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
    lora_model: HFLoraSD = Field(
        default=HFLoraSD(),
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
    def get_recommended_models(cls):
        return (
            HF_STABLE_DIFFUSION_MODELS
            + HF_LORA_SD_MODELS
            + [
                HFIPAdapter(
                    repo_id="h94/IP-Adapter",
                    allow_patterns=[
                        "models/*.safetensors",
                    ],
                ),
            ]
        )

    @classmethod
    def is_visible(cls) -> bool:
        return cls is not StableDiffusionBaseNode

    async def initialize(self, context: ProcessingContext):
        raise NotImplementedError("Subclasses must implement this method")

    def should_skip_cache(self):
        if self.ip_adapter_model != IPAdapter_SD15_Model.NONE:
            return True
        if self.lora_model.repo_id != "":
            return True
        return False

    def _load_ip_adapter(self):
        if self.ip_adapter_model != IPAdapter_SD15_Model.NONE:
            cache_path = try_to_load_from_cache(
                "h94/IP-Adapter", f"models/{self.ip_adapter_model.value}"
            )
            if cache_path is None:
                raise ValueError(
                    f"Install the h94/IP-Adapter model to use {self.ip_adapter_model.value} (Recommended Models above)"
                )
            self._pipeline.load_ip_adapter(
                "h94/IP-Adapter",
                subfolder="models",
                weight_name=self.ip_adapter_model,
            )
            self._pipeline.set_ip_adapter_scale(self.ip_adapter_scale)

    async def _load_lora(self, context: ProcessingContext):
        if self.lora_model.repo_id != "" and self.lora_model.path:
            cache_path = try_to_load_from_cache(
                self.lora_model.repo_id,
                self.lora_model.path,
            )
            if cache_path is None:
                raise ValueError(
                    f"Install {self.lora_model.repo_id}/{self.lora_model.path} LORA to use it (Recommended Models above)"
                )
            self._pipeline.load_lora_weights(
                cache_path,
                weight_name=self.lora_model.path,
                adapter_name="default",
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
        generator = torch.Generator(device="cpu")
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
            self._pipeline = await self.load_model(
                context=context,
                model_class=StableDiffusionPipeline,
                model_id=self.model.repo_id,
                path=self.model.path,
            )
            assert self._pipeline is not None
            self._set_scheduler(self.scheduler)
            await self._load_lora(context)
            self._load_ip_adapter()

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        generator = self._setup_generator()
        ip_adapter_image = (
            await context.image_to_pil(self.ip_adapter_image)
            if self.ip_adapter_image.is_set()
            else None
        )

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
        controlnet = await self.load_model(
            context=context,
            model_class=ControlNetModel,
            model_id=self.controlnet.repo_id,
        )
        self._pipeline = await self.load_model(
            context=context,
            model_class=StableDiffusionControlNetPipeline,
            model_id=self.controlnet.repo_id,
            controlnet=controlnet,
        )
        self._load_ip_adapter()
        await self._load_lora(context)

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        control_image = await context.image_to_pil(self.control_image)
        ip_adapter_image = (
            await context.image_to_pil(self.ip_adapter_image)
            if self.ip_adapter_image.is_set()
            else None
        )
        generator = self._setup_generator()

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
            ip_adapter_scale=self.ip_adapter_scale,
            cross_attention_kwargs={"scale": self.lora_scale},
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
        self._pipeline = await self.load_model(
            context=context,
            model_class=StableDiffusionImg2ImgPipeline,
            model_id=self.model.repo_id,
            safety_checker=None,
        )
        assert self._pipeline is not None
        self._pipeline.enable_model_cpu_offload()
        self._set_scheduler(self.scheduler)
        await self._load_lora(context)
        self._load_ip_adapter()

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        generator = self._setup_generator()
        init_image = await context.image_to_pil(self.init_image)
        ip_adapter_image = (
            await context.image_to_pil(self.ip_adapter_image)
            if self.ip_adapter_image.is_set()
            else None
        )

        image = self._pipeline(
            prompt=self.prompt,
            image=init_image,
            ip_adapter_image=ip_adapter_image,
            negative_prompt=self.negative_prompt,
            num_inference_steps=self.num_inference_steps,
            guidance_scale=self.guidance_scale,
            ip_adapter_scale=self.ip_adapter_scale,
            cross_attention_kwargs={"scale": self.lora_scale},
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
        controlnet = await self.load_pipeline(
            context,
            "controlnet",
            self.controlnet.value,
            device=context.device,
        )
        self._pipeline = await self.load_pipeline(
            context,
            "stable-diffusion-controlnet-inpaint",
            self.model.repo_id,
            controlnet=controlnet,
            device=context.device,
        )
        assert self._pipeline is not None
        self._set_scheduler(self.scheduler)
        await self._load_lora(context)
        self._load_ip_adapter()

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")
        init_image = await context.image_to_pil(self.init_image)
        mask_image = await context.image_to_pil(self.mask_image)
        control_image = await context.image_to_pil(self.control_image)
        ip_adapter_image = (
            await context.image_to_pil(self.ip_adapter_image)
            if self.ip_adapter_image.is_set()
            else None
        )
        generator = self._setup_generator()

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
            ip_adapter_scale=self.ip_adapter_scale,
            cross_attention_kwargs={"scale": self.lora_scale},
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
            self._pipeline = await self.load_pipeline(
                context,
                "stable-diffusion-inpaint",
                self.model.repo_id,
                device=context.device,
            )
            assert self._pipeline is not None
            self._load_ip_adapter()
            self._set_scheduler(self.scheduler)
            await self._load_lora(context)

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        generator = self._setup_generator()
        init_image = await context.image_to_pil(self.init_image)
        mask_image = await context.image_to_pil(self.mask_image)
        ip_adapter_image = (
            await context.image_to_pil(self.ip_adapter_image)
            if self.ip_adapter_image.is_set()
            else None
        )

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
            ip_adapter_scale=self.ip_adapter_scale,
            cross_attention_kwargs={"scale": self.lora_scale},
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
        await self._load_lora(context)

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        input_image = await context.image_to_pil(self.image)
        control_image = await context.image_to_pil(self.control_image)
        ip_adapter_image = (
            await context.image_to_pil(self.ip_adapter_image)
            if self.ip_adapter_image.is_set()
            else None
        )

        generator = torch.Generator(device="cpu").manual_seed(self.seed)

        image = self._pipeline(
            prompt=self.prompt,
            image=input_image,
            control_image=control_image,
            ip_adapter_image=ip_adapter_image,
            ip_adapter_scale=self.ip_adapter_scale,
            width=input_image.width,
            height=input_image.height,
            num_inference_steps=self.num_inference_steps,
            generator=generator,
            cross_attention_kwargs={"scale": self.lora_scale},
            callback=self.progress_callback(context),
            callback_steps=1,
        ).images[  # type: ignore
            0
        ]

        return await context.image_from_pil(image)


class StableDiffusionUpscale(HuggingFacePipelineNode):
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
    def get_recommended_models(cls):
        return [
            HFStableDiffusionUpscale(
                repo_id="stabilityai/stable-diffusion-x4-upscaler",
                allow_patterns=[
                    "**/*.fp16.safetensors",
                    "**/*.json",
                    "**/*.txt",
                    "*.json",
                ],
            )
        ]

    async def initialize(self, context: ProcessingContext):

        self._pipeline = await self.load_model(
            context=context,
            model_class=StableDiffusionUpscalePipeline,
            model_id="stabilityai/stable-diffusion-x4-upscaler",
        )
        assert self._pipeline is not None
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


class StableDiffusionXLBase(HuggingFacePipelineNode):
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
    lora_model: HFLoraSDXL = Field(
        default=HFLoraSDXL(),
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
    def get_recommended_models(cls):
        return (
            [
                HFIPAdapter(
                    repo_id="h94/IP-Adapter",
                    allow_patterns=[
                        "models/*.safetensors",
                    ],
                )
            ]
            + HF_STABLE_DIFFUSION_XL_MODELS
            + HF_LORA_SDXL_MODELS
            + [
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
        )

    @classmethod
    def is_visible(cls) -> bool:
        return cls is not StableDiffusionXLBase

    def should_skip_cache(self):
        if self.ip_adapter_model != IPAdapter_SDXL_Model.NONE:
            return True
        if self.lora_model.repo_id != "":
            return True
        return False

    def _set_scheduler(self, scheduler_type: StableDiffusionScheduler):
        scheduler_class = get_scheduler_class(scheduler_type)
        if "turbo" in self.model.repo_id:
            self._pipeline.scheduler = scheduler_class.from_config(
                self._pipeline.scheduler.config,
                timestep_spacing="trailing",
            )
        else:
            self._pipeline.scheduler = scheduler_class.from_config(
                self._pipeline.scheduler.config,
            )

    async def move_to_device(self, device: str):
        if self._pipeline is not None:
            self._pipeline.to(device)

    def _setup_generator(self):
        generator = torch.Generator(device="cpu")
        if self.seed != -1:
            generator = generator.manual_seed(self.seed)
        return generator

    def _load_ip_adapter(self):
        if self.ip_adapter_model != IPAdapter_SDXL_Model.NONE:
            self._pipeline.load_ip_adapter(
                "h94/IP-Adapter",
                subfolder="sdxl_models",
                weight_name=self.ip_adapter_model.value,
            )

    async def _load_lora(self, context: ProcessingContext):
        if self.lora_model.repo_id != "" and self.lora_model.path is not None:
            cache_path = try_to_load_from_cache(
                self.lora_model.repo_id,
                self.lora_model.path,
            )
            if cache_path is None:
                raise ValueError(
                    f"Install {self.lora_model.repo_id}/{self.lora_model.path} LORA to use it (Recommended Models above)"
                )

            self._pipeline.__loras__ = {"default": self.lora_model.path}
            self._pipeline.load_lora_weights(
                self.lora_model.repo_id,
                weight_name=self.lora_model.path,
                adapter_name="default",
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

    _pipeline: StableDiffusionXLPipeline | None = None

    @classmethod
    def get_title(cls):
        return "Stable Diffusion XL"

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_model(
            context=context,
            model_class=StableDiffusionXLPipeline,
            model_id=self.model.repo_id,
            path=self.model.path,
        )
        assert self._pipeline is not None
        self._set_scheduler(self.scheduler)
        await self._load_lora(context)
        self._load_ip_adapter()

    async def process(self, context) -> ImageRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        generator = self._setup_generator()
        ip_adapter_image = (
            await context.image_to_pil(self.ip_adapter_image)
            if self.ip_adapter_image.is_set()
            else None
        )

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
        ).images[
            0
        ]  # type: ignore

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

    _pipeline: StableDiffusionXLImg2ImgPipeline | None = None

    def required_inputs(self):
        return ["init_image"]

    @classmethod
    def get_title(cls):
        return "Stable Diffusion XL (Img2Img)"

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_model(
            context=context,
            model_class=StableDiffusionXLImg2ImgPipeline,
            model_id=self.model.repo_id,
        )
        assert self._pipeline is not None
        self._set_scheduler(self.scheduler)

    async def process(self, context) -> ImageRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        await self._load_lora(context)
        generator = self._setup_generator()
        init_image = await context.image_to_pil(self.init_image)
        init_image = init_image.resize((self.width, self.height))
        ip_adapter_image = (
            await context.image_to_pil(self.ip_adapter_image)
            if self.ip_adapter_image.is_set()
            else None
        )

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
        ).images[
            0
        ]  # type: ignore

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
    def get_recommended_models(cls):
        return [
            HFStableDiffusionXL(
                repo_id="stabilityai/stable-diffusion-xl-inpainting-0.1",
                allow_patterns=[
                    "**/*.fp16.safetensors",
                    "**/*.json",
                    "**/*.txt",
                    "*.json",
                ],
            )
        ]

    async def initialize(self, context: ProcessingContext):
        if self._pipeline is None:
            self._pipeline = await self.load_model(
                context=context,
                model_class=AutoPipelineForInpainting,
                model_id=self.model.repo_id,
            )
            assert self._pipeline is not None
            self._set_scheduler(self.scheduler)

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        generator = self._setup_generator()
        input_image = await context.image_to_pil(self.image)
        mask_image = await context.image_to_pil(self.mask_image)
        mask_image = mask_image.resize((self.width, self.height))
        ip_adapter_image = (
            await context.image_to_pil(self.ip_adapter_image)
            if self.ip_adapter_image.is_set()
            else None
        )

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

    async def initialize(self, context: ProcessingContext):
        controlnet = self.load_model(
            context=context,
            model_class=ControlNetModel,
            model_id=self.control_model.value,
        )
        self._pipeline = await self.load_model(
            context=context,
            model_class=StableDiffusionXLControlNetPipeline,
            model_id=self.model.repo_id,
        )

        self._set_scheduler(self.scheduler)

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        await self._load_lora(context)
        generator = self._setup_generator()

        control_image = await context.image_to_pil(self.control_image)

        if not self.init_image.is_empty():
            init_image = await context.image_to_pil(self.init_image)
            init_image = init_image.resize((self.width, self.height))
        else:
            init_image = None

        ip_adapter_image = (
            await context.image_to_pil(self.ip_adapter_image)
            if self.ip_adapter_image.is_set()
            else None
        )

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


# throws an error
# class DocumentQuestionAnswering(HuggingFacePipelineNode):
#     """
#     Answers questions based on a given document.
#     text, question answering, document, natural language processing

#     Use cases:
#     - Information retrieval from long documents
#     - Automated document analysis
#     - Enhancing search functionality in document repositories
#     - Assisting in research and data extraction tasks
#     """

#     class DocumentQuestionAnsweringModelId(str, Enum):
#         IMPIRA_LAYOUTLM_DOCUMENT_QA = "impira/layoutlm-document-qa"

#     model: DocumentQuestionAnsweringModelId = Field(
#         default=DocumentQuestionAnsweringModelId.IMPIRA_LAYOUTLM_DOCUMENT_QA,
#         title="Model ID on Huggingface",
#         description="The model ID to use for document question answering",
#     )
#     image: ImageRef = Field(
#         default=ImageRef(),
#         title="Document Image",
#         description="The image of the document to analyze",
#     )
#     question: str = Field(
#         default="",
#         title="Question",
#         description="The question to be answered based on the document",
#     )

#     def get_model_id(self):
#         return self.model.value

#     async def get_inputs(self, context: ProcessingContext):
#         image = await context.image_to_pil(self.image)
#         return {
#             "image": image,
#             "question": self.question,
#         }

#     @property
#     def pipeline_task(self) -> str:
#         return 'document-question-answering'

#     async def process_remote_result(self, context: ProcessingContext, result: Any) -> dict[str, Any]:
#         return await self.process_local_result(context, result)

#     async def process_local_result(self, context: ProcessingContext, result: Any) -> dict[str, Any]:
#         return {
#             "answer": result["answer"],
#             "score": result["score"],
#         }

#     async def process(self, context: ProcessingContext) -> dict[str, Any]:
#         return await super().process(context)


class ImageFeatureExtraction(HuggingFacePipelineNode):
    """
    Extracts features from images using pre-trained models.
    image, feature extraction, embeddings, computer vision

    Use cases:
    - Image similarity comparison
    - Clustering images
    - Input for machine learning models
    - Content-based image retrieval
    """

    model: HFImageFeatureExtraction = Field(
        default=HFImageFeatureExtraction(),
        title="Model ID on Huggingface",
        description="The model ID to use for image feature extraction",
    )
    image: ImageRef = Field(
        default=ImageRef(),
        title="Input Image",
        description="The image to extract features from",
    )

    @classmethod
    def get_recommended_models(cls):
        return [
            HFImageFeatureExtraction(
                repo_id="google/vit-base-patch16-224-in21k",
                allow_patterns=["*.safetensors", "*.txt", "*,json"],
            ),
            HFImageFeatureExtraction(
                repo_id="facebook/dinov2-base",
                allow_patterns=["*.safetensors", "*.txt", "*,json"],
            ),
            HFImageFeatureExtraction(
                repo_id="facebook/dinov2-small",
                allow_patterns=["*.safetensors", "*.txt", "*,json"],
            ),
        ]

    def required_inputs(self):
        return ["image"]

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_pipeline(
            context=context,
            pipeline_task="image-feature-extraction",
            model_id=self.model.repo_id,
        )

    async def move_to_device(self, device: str):
        self._pipeline.model.to(device)  # type: ignore

    async def process(self, context: ProcessingContext) -> Tensor:
        # The result is typically a list with a single numpy array
        # We'll return this array as a Tensor
        assert self._pipeline is not None
        image = await context.image_to_pil(self.image)
        result = self._pipeline(image)
        assert isinstance(result, list)
        assert len(result) == 1
        return Tensor.from_numpy(np.array(result[0]))
