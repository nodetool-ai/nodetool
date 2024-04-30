from pydantic import BaseModel, Field
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode
from nodetool.common.replicate_node import ReplicateNode
from enum import Enum


class Style(str, Enum):
    _3D = "3D"
    EMOJI = "Emoji"
    VIDEO_GAME = "Video game"
    PIXELS = "Pixels"
    CLAY = "Clay"
    TOY = "Toy"


class FaceToMany(ReplicateNode):
    """Turn a face into 3D, emoji, pixel art, video game, claymation or toy"""

    def replicate_model_id(self):
        return "fofr/face-to-many:a07f252abbbd832009640b27f063ea52d87d7a23a185ca165bec23b5adc8deaf"

    def get_hardware(self):
        return "None"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://replicate.delivery/pbxt/R1ayGe5efoQbaoRzgDEJdLsIZ20lWRiprvoW1F4uKAZIha6kA/ComfyUI_00001_.png",
            "created_at": "2024-03-05T13:01:03.163557Z",
            "description": "Turn a face into 3D, emoji, pixel art, video game, claymation or toy",
            "github_url": "https://github.com/fofr/cog-face-to-many",
            "license_url": "https://github.com/fofr/cog-face-to-many/blob/main/weights_licenses.md",
            "name": "face-to-many",
            "owner": "fofr",
            "paper_url": None,
            "run_count": 10579948,
            "url": "https://replicate.com/fofr/face-to-many",
            "visibility": "public",
        }

    @classmethod
    def return_type(cls):
        return ImageRef

    seed: int | None = Field(
        title="Seed",
        description="Fix the random seed for reproducibility",
        default=None,
    )
    image: ImageRef = Field(
        default=ImageRef(), description="An image of a person to be converted"
    )
    style: Style = Field(description="Style to convert to", default="3D")
    prompt: str = Field(title="Prompt", default="a person")
    lora_scale: float = Field(
        title="Lora Scale",
        description="How strong the LoRA will be",
        ge=0.0,
        le=1.0,
        default=1,
    )
    custom_lora_url: str | None = Field(
        title="Custom Lora Url",
        description="URL to a Replicate custom LoRA. Must be in the format https://replicate.delivery/pbxt/[id]/trained_model.tar or https://pbxt.replicate.delivery/[id]/trained_model.tar",
        default=None,
    )
    negative_prompt: str = Field(
        title="Negative Prompt",
        description="Things you do not want in the image",
        default="",
    )
    prompt_strength: float = Field(
        title="Prompt Strength",
        description="Strength of the prompt. This is the CFG scale, higher numbers lead to stronger prompt, lower numbers will keep more of a likeness to the original.",
        ge=0.0,
        le=20.0,
        default=4.5,
    )
    denoising_strength: float = Field(
        title="Denoising Strength",
        description="How much of the original image to keep. 1 is the complete destruction of the original image, 0 is the original image",
        ge=0.0,
        le=1.0,
        default=0.65,
    )
    instant_id_strength: float = Field(
        title="Instant Id Strength",
        description="How strong the InstantID will be.",
        ge=0.0,
        le=1.0,
        default=1,
    )
    control_depth_strength: float = Field(
        title="Control Depth Strength",
        description="Strength of depth controlnet. The bigger this is, the more controlnet affects the output.",
        ge=0.0,
        le=1.0,
        default=0.8,
    )


class BecomeImage(ReplicateNode):
    """Adapt any picture of a face into another image"""

    def replicate_model_id(self):
        return "fofr/become-image:8d0b076a2aff3904dfcec3253c778e0310a68f78483c4699c7fd800f3051d2b3"

    def get_hardware(self):
        return "Nvidia A40 (Large) GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/d93dcb3c-dbc8-4e41-a3e1-f96aaf5875b1/pearl-earring.webp",
            "created_at": "2024-03-11T11:16:22.168373Z",
            "description": "Adapt any picture of a face into another image",
            "github_url": "https://github.com/fofr/cog-become-image",
            "license_url": "https://github.com/fofr/cog-become-image/blob/main/weights_licenses.md",
            "name": "become-image",
            "owner": "fofr",
            "paper_url": None,
            "run_count": 176043,
            "url": "https://replicate.com/fofr/become-image",
            "visibility": "public",
            "hardware": "Nvidia A40 (Large) GPU",
        }

    @classmethod
    def return_type(cls):
        return ImageRef

    seed: int | None = Field(
        title="Seed",
        description="Fix the random seed for reproducibility",
        default=None,
    )
    image: ImageRef = Field(
        default=ImageRef(), description="An image of a person to be converted"
    )
    prompt: str = Field(title="Prompt", default="a person")
    image_to_become: ImageRef = Field(
        default=ImageRef(), description="Any image to convert the person to"
    )
    negative_prompt: str = Field(
        title="Negative Prompt",
        description="Things you do not want in the image",
        default="",
    )
    prompt_strength: float = Field(
        title="Prompt Strength",
        description="Strength of the prompt. This is the CFG scale, higher numbers lead to stronger prompt, lower numbers will keep more of a likeness to the original.",
        ge=0.0,
        le=3.0,
        default=2,
    )
    number_of_images: int = Field(
        title="Number Of Images",
        description="Number of images to generate",
        ge=1.0,
        le=10.0,
        default=2,
    )
    denoising_strength: float = Field(
        title="Denoising Strength",
        description="How much of the original image of the person to keep. 1 is the complete destruction of the original image, 0 is the original image",
        ge=0.0,
        le=1.0,
        default=1,
    )
    instant_id_strength: float = Field(
        title="Instant Id Strength",
        description="How strong the InstantID will be.",
        ge=0.0,
        le=1.0,
        default=1,
    )
    image_to_become_noise: float = Field(
        title="Image To Become Noise",
        description="How much noise to add to the style image before processing. An alternative way of controlling stength.",
        ge=0.0,
        le=1.0,
        default=0.3,
    )
    control_depth_strength: float = Field(
        title="Control Depth Strength",
        description="Strength of depth controlnet. The bigger this is, the more controlnet affects the output.",
        ge=0.0,
        le=1.0,
        default=0.8,
    )
    disable_safety_checker: bool = Field(
        title="Disable Safety Checker",
        description="Disable safety checker for generated images",
        default=False,
    )
    image_to_become_strength: float = Field(
        title="Image To Become Strength",
        description="How strong the style will be applied",
        ge=0.0,
        le=1.0,
        default=0.75,
    )


class Style_name(str, Enum):
    NO_STYLE = "(No style)"
    CINEMATIC = "Cinematic"
    DISNEY_CHARACTOR = "Disney Charactor"
    DIGITAL_ART = "Digital Art"
    PHOTOGRAPHIC__DEFAULT = "Photographic (Default)"
    FANTASY_ART = "Fantasy art"
    NEONPUNK = "Neonpunk"
    ENHANCE = "Enhance"
    COMIC_BOOK = "Comic book"
    LOWPOLY = "Lowpoly"
    LINE_ART = "Line art"


class PhotoMaker(ReplicateNode):
    """Create photos, paintings and avatars for anyone in any style within seconds."""

    def replicate_model_id(self):
        return "tencentarc/photomaker:ddfc2b08d209f9fa8c1eca692712918bd449f695dabb4a958da31802a9570fe4"

    def get_hardware(self):
        return "Nvidia A40 (Large) GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/75f21a83-c142-4cba-9750-dc9724b12b77/photomaker-cover-img-scarjo.jpg",
            "created_at": "2024-01-16T15:42:17.882162Z",
            "description": "Create photos, paintings and avatars for anyone in any style within seconds.",
            "github_url": "https://github.com/datakami-models/PhotoMaker",
            "license_url": "https://github.com/TencentARC/PhotoMaker/blob/main/LICENSE",
            "name": "photomaker",
            "owner": "tencentarc",
            "paper_url": "https://huggingface.co/papers/2312.04461",
            "run_count": 1120348,
            "url": "https://replicate.com/tencentarc/photomaker",
            "visibility": "public",
            "hardware": "Nvidia A40 (Large) GPU",
        }

    @classmethod
    def return_type(cls):
        return ImageRef

    seed: int | None = Field(
        title="Seed",
        description="Seed. Leave blank to use a random number",
        ge=0.0,
        le=2147483647.0,
        default=None,
    )
    prompt: str = Field(
        title="Prompt",
        description="Prompt. Example: 'a photo of a man/woman img'. The phrase 'img' is the trigger word.",
        default="A photo of a person img",
    )
    num_steps: int = Field(
        title="Num Steps",
        description="Number of sample steps",
        ge=1.0,
        le=100.0,
        default=20,
    )
    style_name: Style_name = Field(
        description="Style template. The style template will add a style-specific prompt and negative prompt to the user's prompt.",
        default="Photographic (Default)",
    )
    input_image: str | None = Field(
        title="Input Image",
        description="The input image, for example a photo of your face.",
        default=None,
    )
    num_outputs: int = Field(
        title="Num Outputs",
        description="Number of output images",
        ge=1.0,
        le=4.0,
        default=1,
    )
    input_image2: str | None = Field(
        title="Input Image2",
        description="Additional input image (optional)",
        default=None,
    )
    input_image3: str | None = Field(
        title="Input Image3",
        description="Additional input image (optional)",
        default=None,
    )
    input_image4: str | None = Field(
        title="Input Image4",
        description="Additional input image (optional)",
        default=None,
    )
    guidance_scale: float = Field(
        title="Guidance Scale",
        description="Guidance scale. A guidance scale of 1 corresponds to doing no classifier free guidance.",
        ge=1.0,
        le=10.0,
        default=5,
    )
    negative_prompt: str = Field(
        title="Negative Prompt",
        description="Negative Prompt. The negative prompt should NOT contain the trigger word.",
        default="nsfw, lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry",
    )
    style_strength_ratio: float = Field(
        title="Style Strength Ratio",
        description="Style strength (%)",
        ge=15.0,
        le=50.0,
        default=20,
    )
    disable_safety_checker: bool = Field(
        title="Disable Safety Checker",
        description="Disable safety checker for generated images.",
        default=False,
    )


class PhotoMakerStyle(ReplicateNode):
    """Create photos, paintings and avatars for anyone in any style within seconds.  (Stylization version)"""

    def replicate_model_id(self):
        return "tencentarc/photomaker-style:467d062309da518648ba89d226490e02b8ed09b5abc15026e54e31c5a8cd0769"

    def get_hardware(self):
        return "Nvidia A40 (Large) GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/8e85a287-826f-4c21-9079-22eac106dd6b/output.0.png",
            "created_at": "2024-01-18T14:28:51.763369Z",
            "description": "Create photos, paintings and avatars for anyone in any style within seconds.  (Stylization version)",
            "github_url": "https://github.com/TencentARC/PhotoMaker",
            "license_url": "https://github.com/TencentARC/PhotoMaker/blob/main/LICENSE",
            "name": "photomaker-style",
            "owner": "tencentarc",
            "paper_url": "https://huggingface.co/papers/2312.04461",
            "run_count": 283721,
            "url": "https://replicate.com/tencentarc/photomaker-style",
            "visibility": "public",
            "hardware": "Nvidia A40 (Large) GPU",
        }

    @classmethod
    def return_type(cls):
        return ImageRef

    seed: int | None = Field(
        title="Seed",
        description="Seed. Leave blank to use a random number",
        ge=0.0,
        le=2147483647.0,
        default=None,
    )
    prompt: str = Field(
        title="Prompt",
        description="Prompt. Example: 'a photo of a man/woman img'. The phrase 'img' is the trigger word.",
        default="A photo of a person img",
    )
    num_steps: int = Field(
        title="Num Steps",
        description="Number of sample steps",
        ge=1.0,
        le=100.0,
        default=20,
    )
    style_name: Style_name = Field(
        description="Style template. The style template will add a style-specific prompt and negative prompt to the user's prompt.",
        default="(No style)",
    )
    input_image: ImageRef = Field(
        default=ImageRef(),
        description="The input image, for example a photo of your face.",
    )
    num_outputs: int = Field(
        title="Num Outputs",
        description="Number of output images",
        ge=1.0,
        le=4.0,
        default=1,
    )
    input_image2: ImageRef = Field(
        default=ImageRef(), description="Additional input image (optional)"
    )
    input_image3: ImageRef = Field(
        default=ImageRef(), description="Additional input image (optional)"
    )
    input_image4: ImageRef = Field(
        default=ImageRef(), description="Additional input image (optional)"
    )
    guidance_scale: float = Field(
        title="Guidance Scale",
        description="Guidance scale. A guidance scale of 1 corresponds to doing no classifier free guidance.",
        ge=1.0,
        le=10.0,
        default=5,
    )
    negative_prompt: str = Field(
        title="Negative Prompt",
        description="Negative Prompt. The negative prompt should NOT contain the trigger word.",
        default="nsfw, lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry",
    )
    style_strength_ratio: float = Field(
        title="Style Strength Ratio",
        description="Style strength (%)",
        ge=15.0,
        le=50.0,
        default=20,
    )
    disable_safety_checker: bool = Field(
        title="Disable Safety Checker",
        description="Disable safety checker for generated images.",
        default=False,
    )


class FaceToSticker(ReplicateNode):
    """Turn a face into a sticker"""

    def replicate_model_id(self):
        return "fofr/face-to-sticker:764d4827ea159608a07cdde8ddf1c6000019627515eb02b6b449695fd547e5ef"

    def get_hardware(self):
        return "Nvidia A40 (Large) GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://replicate.delivery/pbxt/RZzqVdLsqSZgHtEefD00iMK8VuDif6iVmXlSbNeiAShPuHtJB/ComfyUI_00002_.png",
            "created_at": "2024-02-28T15:14:15.687345Z",
            "description": "Turn a face into a sticker",
            "github_url": "https://github.com/fofr/cog-face-to-sticker",
            "license_url": "https://github.com/fofr/cog-face-to-sticker/blob/main/weights_licenses.md",
            "name": "face-to-sticker",
            "owner": "fofr",
            "paper_url": None,
            "run_count": 679389,
            "url": "https://replicate.com/fofr/face-to-sticker",
            "visibility": "public",
            "hardware": "Nvidia A40 (Large) GPU",
        }

    @classmethod
    def return_type(cls):
        return ImageRef

    seed: int | None = Field(
        title="Seed",
        description="Fix the random seed for reproducibility",
        default=None,
    )
    image: ImageRef = Field(
        default=ImageRef(),
        description="An image of a person to be converted to a sticker",
    )
    steps: int = Field(title="Steps", default=20)
    width: int = Field(title="Width", default=1024)
    height: int = Field(title="Height", default=1024)
    prompt: str = Field(title="Prompt", default="a person")
    upscale: bool = Field(
        title="Upscale", description="2x upscale the sticker", default=False
    )
    upscale_steps: int = Field(
        title="Upscale Steps", description="Number of steps to upscale", default=10
    )
    negative_prompt: str = Field(
        title="Negative Prompt",
        description="Things you do not want in the image",
        default="",
    )
    prompt_strength: float = Field(
        title="Prompt Strength",
        description="Strength of the prompt. This is the CFG scale, higher numbers lead to stronger prompt, lower numbers will keep more of a likeness to the original.",
        default=7,
    )
    ip_adapter_noise: float = Field(
        title="Ip Adapter Noise",
        description="How much noise is added to the IP adapter input",
        ge=0.0,
        le=1.0,
        default=0.5,
    )
    ip_adapter_weight: float = Field(
        title="Ip Adapter Weight",
        description="How much the IP adapter will influence the image",
        ge=0.0,
        le=1.0,
        default=0.2,
    )
    instant_id_strength: float = Field(
        title="Instant Id Strength",
        description="How strong the InstantID will be.",
        ge=0.0,
        le=1.0,
        default=1,
    )


class Scheduler(str, Enum):
    DEISMULTISTEPSCHEDULER = "DEISMultistepScheduler"
    HEUNDISCRETESCHEDULER = "HeunDiscreteScheduler"
    EULERDISCRETESCHEDULER = "EulerDiscreteScheduler"
    DPMSOLVERMULTISTEPSCHEDULER = "DPMSolverMultistepScheduler"
    DPMSOLVERMULTISTEPSCHEDULER_KARRAS = "DPMSolverMultistepScheduler-Karras"
    DPMSOLVERMULTISTEPSCHEDULER_KARRAS_SDE = "DPMSolverMultistepScheduler-Karras-SDE"


class Sdxl_weights(str, Enum):
    STABLE_DIFFUSION_XL_BASE_1_0 = "stable-diffusion-xl-base-1.0"
    JUGGERNAUT_XL_V8 = "juggernaut-xl-v8"
    AFRODITE_XL_V2 = "afrodite-xl-v2"
    ALBEDOBASE_XL_20 = "albedobase-xl-20"
    ALBEDOBASE_XL_V13 = "albedobase-xl-v13"
    ANIMAGINE_XL_30 = "animagine-xl-30"
    ANIME_ART_DIFFUSION_XL = "anime-art-diffusion-xl"
    ANIME_ILLUST_DIFFUSION_XL = "anime-illust-diffusion-xl"
    DREAMSHAPER_XL = "dreamshaper-xl"
    DYNAVISION_XL_V0610 = "dynavision-xl-v0610"
    GUOFENG4_XL = "guofeng4-xl"
    NIGHTVISION_XL_0791 = "nightvision-xl-0791"
    OMNIGEN_XL = "omnigen-xl"
    PONY_DIFFUSION_V6_XL = "pony-diffusion-v6-xl"
    PROTOVISION_XL_HIGH_FIDEL = "protovision-xl-high-fidel"
    REALVISXL_V3_0_TURBO = "RealVisXL_V3.0_Turbo"
    REALVISXL_V4_0_LIGHTNING = "RealVisXL_V4.0_Lightning"


class Output_format(str, Enum):
    WEBP = "webp"
    JPG = "jpg"
    PNG = "png"


class InstantId(ReplicateNode):
    """Make realistic images of real people instantly"""

    def replicate_model_id(self):
        return "zsxkib/instant-id:491ddf5be6b827f8931f088ef10c6d015f6d99685e6454e6f04c8ac298979686"

    def get_hardware(self):
        return "Nvidia A40 (Large) GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/29bb719e-5db7-4816-9cfc-84b141ac8670/instantidcover.jpg",
            "created_at": "2024-01-22T21:00:49.120905Z",
            "description": "Make realistic images of real people instantly",
            "github_url": "https://github.com/zsxkib/InstantID",
            "license_url": "https://github.com/zsxkib/InstantID/blob/main/LICENSE",
            "name": "instant-id",
            "owner": "zsxkib",
            "paper_url": "https://arxiv.org/abs/2401.07519",
            "run_count": 375650,
            "url": "https://replicate.com/zsxkib/instant-id",
            "visibility": "public",
            "hardware": "Nvidia A40 (Large) GPU",
        }

    @classmethod
    def return_type(cls):
        return ImageRef

    seed: int | None = Field(
        title="Seed",
        description="Random seed. Leave blank to randomize the seed",
        default=None,
    )
    image: ImageRef = Field(default=ImageRef(), description="Input face image")
    prompt: str = Field(title="Prompt", description="Input prompt", default="a person")
    scheduler: Scheduler = Field(
        description="Scheduler", default="EulerDiscreteScheduler"
    )
    enable_lcm: bool = Field(
        title="Enable Lcm",
        description="Enable Fast Inference with LCM (Latent Consistency Models) - speeds up inference steps, trade-off is the quality of the generated image. Performs better with close-up portrait face images",
        default=False,
    )
    pose_image: ImageRef = Field(
        default=ImageRef(), description="(Optional) reference pose image"
    )
    num_outputs: int = Field(
        title="Num Outputs",
        description="Number of images to output",
        ge=1.0,
        le=8.0,
        default=1,
    )
    sdxl_weights: Sdxl_weights = Field(
        description="Pick which base weights you want to use",
        default="stable-diffusion-xl-base-1.0",
    )
    output_format: Output_format = Field(
        description="Format of the output images", default="webp"
    )
    pose_strength: float = Field(
        title="Pose Strength",
        description="Openpose ControlNet strength, effective only if `enable_pose_controlnet` is true",
        ge=0.0,
        le=1.0,
        default=0.4,
    )
    canny_strength: float = Field(
        title="Canny Strength",
        description="Canny ControlNet strength, effective only if `enable_canny_controlnet` is true",
        ge=0.0,
        le=1.0,
        default=0.3,
    )
    depth_strength: float = Field(
        title="Depth Strength",
        description="Depth ControlNet strength, effective only if `enable_depth_controlnet` is true",
        ge=0.0,
        le=1.0,
        default=0.5,
    )
    guidance_scale: float = Field(
        title="Guidance Scale",
        description="Scale for classifier-free guidance",
        ge=1.0,
        le=50.0,
        default=7.5,
    )
    output_quality: int = Field(
        title="Output Quality",
        description="Quality of the output images, from 0 to 100. 100 is best quality, 0 is lowest quality.",
        ge=0.0,
        le=100.0,
        default=80,
    )
    negative_prompt: str = Field(
        title="Negative Prompt", description="Input Negative Prompt", default=""
    )
    ip_adapter_scale: float = Field(
        title="Ip Adapter Scale",
        description="Scale for image adapter strength (for detail)",
        ge=0.0,
        le=1.5,
        default=0.8,
    )
    lcm_guidance_scale: float = Field(
        title="Lcm Guidance Scale",
        description="Only used when `enable_lcm` is set to True, Scale for classifier-free guidance when using LCM",
        ge=1.0,
        le=20.0,
        default=1.5,
    )
    num_inference_steps: int = Field(
        title="Num Inference Steps",
        description="Number of denoising steps",
        ge=1.0,
        le=500.0,
        default=30,
    )
    disable_safety_checker: bool = Field(
        title="Disable Safety Checker",
        description="Disable safety checker for generated images",
        default=False,
    )
    enable_pose_controlnet: bool = Field(
        title="Enable Pose Controlnet",
        description="Enable Openpose ControlNet, overrides strength if set to false",
        default=True,
    )
    enhance_nonface_region: bool = Field(
        title="Enhance Nonface Region",
        description="Enhance non-face region",
        default=True,
    )
    enable_canny_controlnet: bool = Field(
        title="Enable Canny Controlnet",
        description="Enable Canny ControlNet, overrides strength if set to false",
        default=False,
    )
    enable_depth_controlnet: bool = Field(
        title="Enable Depth Controlnet",
        description="Enable Depth ControlNet, overrides strength if set to false",
        default=False,
    )
    lcm_num_inference_steps: int = Field(
        title="Lcm Num Inference Steps",
        description="Only used when `enable_lcm` is set to True, Number of denoising steps when using LCM",
        ge=1.0,
        le=10.0,
        default=5,
    )
    controlnet_conditioning_scale: float = Field(
        title="Controlnet Conditioning Scale",
        description="Scale for IdentityNet strength (for fidelity)",
        ge=0.0,
        le=1.5,
        default=0.8,
    )
