from pydantic import BaseModel, Field
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode
from nodetool.providers.replicate.replicate_node import ReplicateNode
from enum import Enum


class RealEsrGan(ReplicateNode):
    """Real-ESRGAN for image upscaling on an A100"""

    @classmethod
    def replicate_model_id(cls):
        return "daanelson/real-esrgan-a100:499940604f95b416c3939423df5c64a5c95cfd32b464d755dacfe2192a2de7ef"

    @classmethod
    def get_hardware(cls):
        return "Nvidia A100 (40GB) GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://replicate.delivery/pbxt/lv0iOW3u6DrNOd30ybfmufqWebiuW10YjILw05YZGbeipZZCB/output.png",
            "created_at": "2023-03-10T22:36:15.201038Z",
            "description": "Real-ESRGAN for image upscaling on an A100",
            "github_url": "https://github.com/daanelson/Real-ESRGAN/",
            "license_url": None,
            "name": "real-esrgan-a100",
            "owner": "daanelson",
            "paper_url": None,
            "run_count": 9943669,
            "url": "https://replicate.com/daanelson/real-esrgan-a100",
            "visibility": "public",
            "hardware": "Nvidia A100 (40GB) GPU",
        }

    @classmethod
    def return_type(cls):
        return ImageRef

    image: ImageRef = Field(default=ImageRef(), description="Input image")
    scale: float = Field(
        title="Scale",
        description="Factor to scale image by",
        ge=0.0,
        le=10.0,
        default=4,
    )
    face_enhance: bool = Field(
        title="Face Enhance",
        description="Run GFPGAN face enhancement along with upscaling",
        default=False,
    )


class ClarityUpscaler(ReplicateNode):
    """High resolution image Upscaler and Enhancer. Use at ClarityAI.co. A free Magnific alternative. Twitter/X: @philz1337x"""

    class Handfix(str, Enum):
        DISABLED = "disabled"
        HANDS_ONLY = "hands_only"
        IMAGE_AND_HANDS = "image_and_hands"

    class Sd_model(str, Enum):
        EPICREALISM_NATURALSINRC1VAE_SAFETENSORS__84D76A0328 = (
            "epicrealism_naturalSinRC1VAE.safetensors [84d76a0328]"
        )
        JUGGERNAUT_REBORN_SAFETENSORS__338B85BC4F = (
            "juggernaut_reborn.safetensors [338b85bc4f]"
        )
        FLAT2DANIMERGE_V45SHARP_SAFETENSORS = "flat2DAnimerge_v45Sharp.safetensors"

    class Scheduler(str, Enum):
        DPM___2M_KARRAS = "DPM++ 2M Karras"
        DPM___SDE_KARRAS = "DPM++ SDE Karras"
        DPM___2M_SDE_EXPONENTIAL = "DPM++ 2M SDE Exponential"
        DPM___2M_SDE_KARRAS = "DPM++ 2M SDE Karras"
        EULER_A = "Euler a"
        EULER = "Euler"
        LMS = "LMS"
        HEUN = "Heun"
        DPM2 = "DPM2"
        DPM2_A = "DPM2 a"
        DPM___2S_A = "DPM++ 2S a"
        DPM___2M = "DPM++ 2M"
        DPM___SDE = "DPM++ SDE"
        DPM___2M_SDE = "DPM++ 2M SDE"
        DPM___2M_SDE_HEUN = "DPM++ 2M SDE Heun"
        DPM___2M_SDE_HEUN_KARRAS = "DPM++ 2M SDE Heun Karras"
        DPM___2M_SDE_HEUN_EXPONENTIAL = "DPM++ 2M SDE Heun Exponential"
        DPM___3M_SDE = "DPM++ 3M SDE"
        DPM___3M_SDE_KARRAS = "DPM++ 3M SDE Karras"
        DPM___3M_SDE_EXPONENTIAL = "DPM++ 3M SDE Exponential"
        DPM_FAST = "DPM fast"
        DPM_ADAPTIVE = "DPM adaptive"
        LMS_KARRAS = "LMS Karras"
        DPM2_KARRAS = "DPM2 Karras"
        DPM2_A_KARRAS = "DPM2 a Karras"
        DPM___2S_A_KARRAS = "DPM++ 2S a Karras"
        RESTART = "Restart"
        DDIM = "DDIM"
        PLMS = "PLMS"
        UNIPC = "UniPC"

    class Tiling_width(int, Enum):
        _16 = 16
        _32 = 32
        _48 = 48
        _64 = 64
        _80 = 80
        _96 = 96
        _112 = 112
        _128 = 128
        _144 = 144
        _160 = 160
        _176 = 176
        _192 = 192
        _208 = 208
        _224 = 224
        _240 = 240
        _256 = 256

    class Output_format(str, Enum):
        WEBP = "webp"
        JPG = "jpg"
        PNG = "png"

    class Tiling_height(int, Enum):
        _16 = 16
        _32 = 32
        _48 = 48
        _64 = 64
        _80 = 80
        _96 = 96
        _112 = 112
        _128 = 128
        _144 = 144
        _160 = 160
        _176 = 176
        _192 = 192
        _208 = 208
        _224 = 224
        _240 = 240
        _256 = 256

    @classmethod
    def replicate_model_id(cls):
        return "philz1337x/clarity-upscaler:5bd0e37172efef85d38698ff2a570f4ce67a9c40c486de0bfddcc5b022acbbd8"

    @classmethod
    def get_hardware(cls):
        return "Nvidia A100 (40GB) GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/76fbe6df-517d-480a-a6e4-dce383b40bbb/Bildschirmfoto_2024-03-30_um_09.2.png",
            "created_at": "2024-03-15T02:35:32.167345Z",
            "description": "High resolution image Upscaler and Enhancer. Use at ClarityAI.co. A free Magnific alternative. Twitter/X: @philz1337x",
            "github_url": "https://github.com/philz1337x/clarity-upscaler",
            "license_url": "https://github.com/philz1337x/clarity-upscaler/blob/main/LICENSE.txt",
            "name": "clarity-upscaler",
            "owner": "philz1337x",
            "paper_url": "https://clarityai.co",
            "run_count": 2219516,
            "url": "https://replicate.com/philz1337x/clarity-upscaler",
            "visibility": "public",
            "hardware": "Nvidia A100 (40GB) GPU",
        }

    @classmethod
    def return_type(cls):
        return ImageRef

    mask: str | None = Field(
        title="Mask",
        description="Mask image to mark areas that should be preserved during upscaling",
        default=None,
    )
    seed: int = Field(
        title="Seed",
        description="Random seed. Leave blank to randomize the seed",
        default=1337,
    )
    image: ImageRef = Field(default=ImageRef(), description="input image")
    prompt: str = Field(
        title="Prompt",
        description="Prompt",
        default="masterpiece, best quality, highres, <lora:more_details:0.5> <lora:SDXLrender_v2.0:1>",
    )
    dynamic: float = Field(
        title="Dynamic", description="HDR, try from 3 - 9", ge=1.0, le=50.0, default=6
    )
    handfix: Handfix = Field(
        description="Use clarity to fix hands in the image", default=Handfix("disabled")
    )
    sharpen: float = Field(
        title="Sharpen",
        description="Sharpen the image after upscaling. The higher the value, the more sharpening is applied. 0 for no sharpening",
        ge=0.0,
        le=10.0,
        default=0,
    )
    sd_model: Sd_model = Field(
        description="Stable Diffusion model checkpoint",
        default=Sd_model("juggernaut_reborn.safetensors [338b85bc4f]"),
    )
    scheduler: Scheduler = Field(
        description="scheduler", default=Scheduler("DPM++ 3M SDE Karras")
    )
    creativity: float = Field(
        title="Creativity",
        description="Creativity, try from 0.3 - 0.9",
        ge=0.0,
        le=1.0,
        default=0.35,
    )
    lora_links: str = Field(
        title="Lora Links",
        description="Link to a lora file you want to use in your upscaling. Multiple links possible, seperated by comma",
        default="",
    )
    downscaling: bool = Field(
        title="Downscaling",
        description="Downscale the image before upscaling. Can improve quality and speed for images with high resolution but lower quality",
        default=False,
    )
    resemblance: float = Field(
        title="Resemblance",
        description="Resemblance, try from 0.3 - 1.6",
        ge=0.0,
        le=3.0,
        default=0.6,
    )
    scale_factor: float = Field(
        title="Scale Factor", description="Scale factor", default=2
    )
    tiling_width: Tiling_width = Field(
        description="Fractality, set lower tile width for a high Fractality",
        default=Tiling_width(112),
    )
    output_format: Output_format = Field(
        description="Format of the output images", default=Output_format("png")
    )
    tiling_height: Tiling_height = Field(
        description="Fractality, set lower tile height for a high Fractality",
        default=Tiling_height(144),
    )
    custom_sd_model: str = Field(title="Custom Sd Model", default="")
    negative_prompt: str = Field(
        title="Negative Prompt",
        description="Negative Prompt",
        default="(worst quality, low quality, normal quality:2) JuggernautNegative-neg",
    )
    num_inference_steps: int = Field(
        title="Num Inference Steps",
        description="Number of denoising steps",
        ge=1.0,
        le=100.0,
        default=18,
    )
    downscaling_resolution: int = Field(
        title="Downscaling Resolution",
        description="Downscaling resolution",
        default=768,
    )


class MagicImageRefiner(ReplicateNode):
    """A better alternative to SDXL refiners, providing a lot of quality and detail. Can also be used for inpainting or upscaling."""

    class Scheduler(str, Enum):
        DDIM = "DDIM"
        DPMSOLVERMULTISTEP = "DPMSolverMultistep"
        K_EULER_ANCESTRAL = "K_EULER_ANCESTRAL"
        K_EULER = "K_EULER"

    class Resolution(str, Enum):
        ORIGINAL = "original"
        _1024 = "1024"
        _2048 = "2048"

    @classmethod
    def replicate_model_id(cls):
        return "batouresearch/magic-image-refiner:507ddf6f977a7e30e46c0daefd30de7d563c72322f9e4cf7cbac52ef0f667b13"

    @classmethod
    def get_hardware(cls):
        return "Nvidia A40 (Large) GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://replicate.delivery/pbxt/H3ZmqoAgsBonKFilPafiEsvYsc2FnjD8EW3vMt6KpkYfd0ISA/out-0.png",
            "created_at": "2024-01-03T16:55:24.594128Z",
            "description": "A better alternative to SDXL refiners, providing a lot of quality and detail. Can also be used for inpainting or upscaling.",
            "github_url": "https://github.com/BatouResearch/magic-image-refiner",
            "license_url": None,
            "name": "magic-image-refiner",
            "owner": "batouresearch",
            "paper_url": None,
            "run_count": 683802,
            "url": "https://replicate.com/batouresearch/magic-image-refiner",
            "visibility": "public",
            "hardware": "Nvidia A40 (Large) GPU",
        }

    @classmethod
    def return_type(cls):
        return ImageRef

    hdr: float = Field(
        title="Hdr",
        description="HDR improvement over the original image",
        ge=0.0,
        le=1.0,
        default=0,
    )
    mask: ImageRef = Field(
        default=ImageRef(),
        description="When provided, refines some section of the image. Must be the same size as the image",
    )
    seed: int | None = Field(title="Seed", description="Seed", default=None)
    image: ImageRef = Field(default=ImageRef(), description="Image to refine")
    steps: int = Field(title="Steps", description="Steps", default=20)
    prompt: str | None = Field(
        title="Prompt", description="Prompt for the model", default=None
    )
    scheduler: Scheduler = Field(
        description="Choose a scheduler.", default=Scheduler("DDIM")
    )
    creativity: float = Field(
        title="Creativity",
        description="Denoising strength. 1 means total destruction of the original image",
        ge=0.0,
        le=1.0,
        default=0.25,
    )
    guess_mode: bool = Field(
        title="Guess Mode",
        description="In this mode, the ControlNet encoder will try best to recognize the content of the input image even if you remove all prompts. The `guidance_scale` between 3.0 and 5.0 is recommended.",
        default=False,
    )
    resolution: Resolution = Field(
        description="Image resolution", default=Resolution("original")
    )
    resemblance: float = Field(
        title="Resemblance",
        description="Conditioning scale for controlnet",
        ge=0.0,
        le=1.0,
        default=0.75,
    )
    guidance_scale: float = Field(
        title="Guidance Scale",
        description="Scale for classifier-free guidance",
        ge=0.1,
        le=30.0,
        default=7,
    )
    negative_prompt: str = Field(
        title="Negative Prompt",
        description="Negative prompt",
        default="teeth, tooth, open mouth, longbody, lowres, bad anatomy, bad hands, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, mutant",
    )


class ruDallE_SR(ReplicateNode):
    """Real-ESRGAN super-resolution model from ruDALL-E"""

    class Scale(int, Enum):
        _2 = 2
        _4 = 4
        _8 = 8

    @classmethod
    def replicate_model_id(cls):
        return "cjwbw/rudalle-sr:32fdb2231d00a10d33754cc2ba794a2dfec94216579770785849ce6f149dbc69"

    @classmethod
    def get_hardware(cls):
        return "Nvidia T4 GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://replicate.delivery/mgxm/588170af-559f-454e-967d-8fb6c7f8304b/out.png",
            "created_at": "2021-11-04T18:36:03.485750Z",
            "description": "Real-ESRGAN super-resolution model from ruDALL-E",
            "github_url": "https://github.com/CJWBW/rudalle-sr",
            "license_url": "https://github.com/chenxwh/rudalle-sr/blob/main/LICENSE.txt",
            "name": "rudalle-sr",
            "owner": "cjwbw",
            "paper_url": "https://arxiv.org/abs/2107.10833",
            "run_count": 473516,
            "url": "https://replicate.com/cjwbw/rudalle-sr",
            "visibility": "public",
            "hardware": "Nvidia T4 GPU",
        }

    @classmethod
    def return_type(cls):
        return ImageRef

    image: ImageRef = Field(default=ImageRef(), description="Input image")
    scale: Scale = Field(description="Choose up-scaling factor", default=Scale(4))


class HighResolutionControlNetTile(ReplicateNode):
    """Fermat.app open-source implementation of an efficient ControlNet 1.1 tile for high-quality upscales. Increase the creativity to encourage hallucination."""

    class Scheduler(str, Enum):
        DDIM = "DDIM"
        DPMSOLVERMULTISTEP = "DPMSolverMultistep"
        K_EULER_ANCESTRAL = "K_EULER_ANCESTRAL"
        K_EULER = "K_EULER"

    class Resolution(int, Enum):
        _2048 = 2048
        _2560 = 2560

    @classmethod
    def replicate_model_id(cls):
        return "batouresearch/high-resolution-controlnet-tile:4af11083a13ebb9bf97a88d7906ef21cf79d1f2e5fa9d87b70739ce6b8113d29"

    @classmethod
    def get_hardware(cls):
        return "Nvidia A100 (80GB) GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://replicate.delivery/pbxt/8Reu1zg6zAV6GShu5yiyP0ueFch9EddJPlVfIxyiMLWBlwJkA/out-0.png",
            "created_at": "2023-12-08T02:32:38.082772Z",
            "description": "Fermat.app open-source implementation of an efficient ControlNet 1.1 tile for high-quality upscales. Increase the creativity to encourage hallucination.",
            "github_url": "https://github.com/BatouResearch/controlnet-tile-upscale",
            "license_url": None,
            "name": "high-resolution-controlnet-tile",
            "owner": "batouresearch",
            "paper_url": None,
            "run_count": 380716,
            "url": "https://replicate.com/batouresearch/high-resolution-controlnet-tile",
            "visibility": "public",
            "hardware": "Nvidia A100 (80GB) GPU",
        }

    @classmethod
    def return_type(cls):
        return ImageRef

    hdr: float = Field(
        title="Hdr",
        description="HDR improvement over the original image",
        ge=0.0,
        le=1.0,
        default=0,
    )
    seed: int | None = Field(title="Seed", description="Seed", default=None)
    image: ImageRef = Field(
        default=ImageRef(), description="Control image for scribble controlnet"
    )
    steps: int = Field(title="Steps", description="Steps", default=20)
    prompt: str | None = Field(
        title="Prompt", description="Prompt for the model", default=None
    )
    scheduler: Scheduler = Field(
        description="Choose a scheduler.", default=Scheduler("DDIM")
    )
    creativity: float = Field(
        title="Creativity",
        description="Denoising strength. 1 means total destruction of the original image",
        ge=0.0,
        le=1.0,
        default=0.5,
    )
    guess_mode: bool = Field(
        title="Guess Mode",
        description="In this mode, the ControlNet encoder will try best to recognize the content of the input image even if you remove all prompts. The `guidance_scale` between 3.0 and 5.0 is recommended.",
        default=False,
    )
    resolution: Resolution = Field(
        description="Image resolution", default=Resolution(2048)
    )
    resemblance: float = Field(
        title="Resemblance",
        description="Conditioning scale for controlnet",
        ge=0.0,
        le=1.0,
        default=0.5,
    )
    guidance_scale: float = Field(
        title="Guidance Scale",
        description="Scale for classifier-free guidance",
        ge=0.1,
        le=30.0,
        default=7,
    )
    negative_prompt: str = Field(
        title="Negative Prompt",
        description="Negative prompt",
        default="teeth, tooth, open mouth, longbody, lowres, bad anatomy, bad hands, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, mutant",
    )


class UltimateSDUpscale(ReplicateNode):
    """Ultimate SD Upscale with ControlNet Tile"""

    class Upscaler(str, Enum):
        _4X_NMKD_SIAX_200K = "4x_NMKD-Siax_200k"
        _4X_ULTRASHARP = "4x-UltraSharp"
        REALESRGAN_X4PLUS = "RealESRGAN_x4plus"
        REALESRGAN_X4PLUS_ANIME_6B = "RealESRGAN_x4plus_anime_6B"

    class Mode_type(str, Enum):
        LINEAR = "Linear"
        CHESS = "Chess"
        NONE = "None"

    class Scheduler(str, Enum):
        NORMAL = "normal"
        KARRAS = "karras"
        EXPONENTIAL = "exponential"
        SGM_UNIFORM = "sgm_uniform"
        SIMPLE = "simple"
        DDIM_UNIFORM = "ddim_uniform"

    class Sampler_name(str, Enum):
        EULER = "euler"
        EULER_ANCESTRAL = "euler_ancestral"
        HEUN = "heun"
        DPM_2 = "dpm_2"
        DPM_2_ANCESTRAL = "dpm_2_ancestral"
        LMS = "lms"
        DPM_FAST = "dpm_fast"
        DPM_ADAPTIVE = "dpm_adaptive"
        DPMPP_2S_ANCESTRAL = "dpmpp_2s_ancestral"
        DPMPP_SDE = "dpmpp_sde"
        DPMPP_SDE_GPU = "dpmpp_sde_gpu"
        DPMPP_2M = "dpmpp_2m"
        DPMPP_2M_SDE = "dpmpp_2m_sde"
        DPMPP_2M_SDE_GPU = "dpmpp_2m_sde_gpu"
        DPMPP_3M_SDE = "dpmpp_3m_sde"
        DPMPP_3M_SDE_GPU = "dpmpp_3m_sde_gpu"
        DPMPP = "dpmpp"
        DDIM = "ddim"
        UNI_PC = "uni_pc"
        UNI_PC_BH2 = "uni_pc_bh2"

    class Seam_fix_mode(str, Enum):
        NONE = "None"
        BAND_PASS = "Band Pass"
        HALF_TILE = "Half Tile"
        HALF_TILE___INTERSECTIONS = "Half Tile + Intersections"

    @classmethod
    def replicate_model_id(cls):
        return "fewjative/ultimate-sd-upscale:5daf1012d946160622cd1bd45ed8f12d9675d24659276ccfe24804035f3b3ad7"

    @classmethod
    def get_hardware(cls):
        return "Nvidia A100 (40GB) GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/ec52df9a-be01-4c74-af9d-a14df03bf03a/output.png",
            "created_at": "2023-11-14T08:41:40.364739Z",
            "description": "Ultimate SD Upscale with ControlNet Tile",
            "github_url": "https://github.com/fewjative/cog-ultimate-sd-upscale",
            "license_url": None,
            "name": "ultimate-sd-upscale",
            "owner": "fewjative",
            "paper_url": None,
            "run_count": 113206,
            "url": "https://replicate.com/fewjative/ultimate-sd-upscale",
            "visibility": "public",
            "hardware": "Nvidia A100 (40GB) GPU",
        }

    @classmethod
    def return_type(cls):
        return ImageRef

    cfg: float = Field(title="Cfg", description="CFG", default=8)
    seed: int | None = Field(
        title="Seed", description="Sampling seed, leave Empty for Random", default=None
    )
    image: ImageRef = Field(default=ImageRef(), description="Input image")
    steps: int = Field(title="Steps", description="Steps", default=20)
    denoise: float = Field(title="Denoise", description="Denoise", default=0.2)
    upscaler: Upscaler = Field(
        description="Upscaler", default=Upscaler("4x-UltraSharp")
    )
    mask_blur: int = Field(title="Mask Blur", description="Mask Blur", default=8)
    mode_type: Mode_type = Field(description="Mode Type", default=Mode_type("Linear"))
    scheduler: Scheduler = Field(description="Scheduler", default=Scheduler("normal"))
    tile_width: int = Field(title="Tile Width", description="Tile Width", default=512)
    upscale_by: float = Field(title="Upscale By", description="Upscale By", default=2)
    tile_height: int = Field(
        title="Tile Height", description="Tile Height", default=512
    )
    sampler_name: Sampler_name = Field(
        description="Sampler", default=Sampler_name("euler")
    )
    tile_padding: int = Field(
        title="Tile Padding", description="Tile Padding", default=32
    )
    seam_fix_mode: Seam_fix_mode = Field(
        description="Seam Fix Mode", default=Seam_fix_mode("None")
    )
    seam_fix_width: int = Field(
        title="Seam Fix Width", description="Seam Fix Width", default=64
    )
    negative_prompt: str = Field(
        title="Negative Prompt", description="Negative Prompt", default=""
    )
    positive_prompt: str = Field(
        title="Positive Prompt",
        description="Positive Prompt",
        default="Hey! Have a nice day :D",
    )
    seam_fix_denoise: float = Field(
        title="Seam Fix Denoise", description="Seam Fix Denoise", default=1
    )
    seam_fix_padding: int = Field(
        title="Seam Fix Padding", description="Seam Fix Padding", default=16
    )
    seam_fix_mask_blur: int = Field(
        title="Seam Fix Mask Blur", description="Seam Fix Mask Blur", default=8
    )
    controlnet_strength: float = Field(
        title="Controlnet Strength", description="ControlNet Strength", default=1
    )
    force_uniform_tiles: bool = Field(
        title="Force Uniform Tiles", description="Force Uniform Tiles", default=True
    )
    use_controlnet_tile: bool = Field(
        title="Use Controlnet Tile", description="Use ControlNet Tile", default=True
    )


class SwinIR(ReplicateNode):
    """Image Restoration Using Swin Transformer"""

    class Noise(int, Enum):
        _15 = 15
        _25 = 25
        _50 = 50

    class Task_type(str, Enum):
        REAL_WORLD_IMAGE_SUPER_RESOLUTION_LARGE = (
            "Real-World Image Super-Resolution-Large"
        )
        REAL_WORLD_IMAGE_SUPER_RESOLUTION_MEDIUM = (
            "Real-World Image Super-Resolution-Medium"
        )
        GRAYSCALE_IMAGE_DENOISING = "Grayscale Image Denoising"
        COLOR_IMAGE_DENOISING = "Color Image Denoising"
        JPEG_COMPRESSION_ARTIFACT_REDUCTION = "JPEG Compression Artifact Reduction"

    @classmethod
    def replicate_model_id(cls):
        return "jingyunliang/swinir:660d922d33153019e8c263a3bba265de882e7f4f70396546b6c9c8f9d47a021a"

    @classmethod
    def get_hardware(cls):
        return "Nvidia A100 (40GB) GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://replicate.delivery/mgxm/1e3c0b87-01a7-4795-abac-aaf17479cf84/out.png",
            "created_at": "2021-09-13T19:58:55.156216Z",
            "description": "Image Restoration Using Swin Transformer",
            "github_url": "https://github.com/JingyunLiang/SwinIR",
            "license_url": "https://github.com/JingyunLiang/SwinIR/blob/main/LICENSE",
            "name": "swinir",
            "owner": "jingyunliang",
            "paper_url": "https://arxiv.org/abs/2108.10257",
            "run_count": 5666819,
            "url": "https://replicate.com/jingyunliang/swinir",
            "visibility": "public",
            "hardware": "Nvidia A100 (40GB) GPU",
        }

    @classmethod
    def return_type(cls):
        return ImageRef

    jpeg: int = Field(
        title="Jpeg",
        description="scale factor, activated for JPEG Compression Artifact Reduction. Leave it as default or arbitrary if other tasks are selected",
        default=40,
    )
    image: ImageRef = Field(default=ImageRef(), description="input image")
    noise: Noise = Field(
        description="noise level, activated for Grayscale Image Denoising and Color Image Denoising. Leave it as default or arbitrary if other tasks are selected",
        default=Noise(15),
    )
    task_type: Task_type = Field(
        description="Choose a task",
        default=Task_type("Real-World Image Super-Resolution-Large"),
    )


class Swin2SR(ReplicateNode):
    """3 Million Runs! AI Photorealistic Image Super-Resolution and Restoration"""

    class Task(str, Enum):
        CLASSICAL_SR = "classical_sr"
        REAL_SR = "real_sr"
        COMPRESSED_SR = "compressed_sr"

    @classmethod
    def replicate_model_id(cls):
        return "mv-lab/swin2sr:a01b0512004918ca55d02e554914a9eca63909fa83a29ff0f115c78a7045574f"

    @classmethod
    def get_hardware(cls):
        return "Nvidia T4 GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/aabde67b-bf5c-4fc8-a4bd-8b2dcba60be6/swin2sr-cover3.png",
            "created_at": "2022-10-28T22:59:05.692845Z",
            "description": "3 Million Runs! AI Photorealistic Image Super-Resolution and Restoration",
            "github_url": "https://github.com/mv-lab/swin2sr",
            "license_url": "https://github.com/mv-lab/swin2sr/blob/main/LICENSE",
            "name": "swin2sr",
            "owner": "mv-lab",
            "paper_url": "https://arxiv.org/abs/2209.11345",
            "run_count": 3509777,
            "url": "https://replicate.com/mv-lab/swin2sr",
            "visibility": "public",
            "hardware": "Nvidia T4 GPU",
        }

    @classmethod
    def return_type(cls):
        return ImageRef

    task: Task = Field(description="Choose a task", default=Task("real_sr"))
    image: ImageRef = Field(default=ImageRef(), description="Input image")
