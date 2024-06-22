from pydantic import BaseModel, Field
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode
from nodetool.providers.replicate.replicate_node import ReplicateNode
from enum import Enum


class VideoMorpher(ReplicateNode):
    """Generate a video that morphs between subjects, with an optional style"""

    class Mode(str, Enum):
        SMALL = "small"
        MEDIUM = "medium"
        UPSCALED = "upscaled"
        UPSCALED_AND_INTERPOLATED = "upscaled-and-interpolated"

    class Checkpoint(str, Enum):
        REALISTIC = "realistic"
        ILLUSTRATED = "illustrated"
        ANIME = "anime"
        _3D = "3D"
        ANY = "any"

    class Aspect_ratio(str, Enum):
        _16_9 = "16:9"
        _4_3 = "4:3"
        _3_2 = "3:2"
        _1_1 = "1:1"
        _2_3 = "2:3"
        _3_4 = "3:4"
        _9_16 = "9:16"

    @classmethod
    def replicate_model_id(cls):
        return "fofr/video-morpher:e70e975067d2b5dbe9e2d9022833d27230a1bdeb3f4af6fe6bb49a548a3039a7"

    @classmethod
    def get_hardware(cls):
        return "Nvidia A40 (Large) GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/cd22e70a-5a93-463d-87ae-bb328d3a2573/ezgif-7-39b54a9237.gif",
            "created_at": "2024-04-24T13:25:30.032622Z",
            "description": "Generate a video that morphs between subjects, with an optional style",
            "github_url": "https://github.com/fofr/cog-video-morpher",
            "license_url": "https://github.com/fofr/cog-video-morpher/blob/main/LICENSE",
            "name": "video-morpher",
            "owner": "fofr",
            "paper_url": None,
            "run_count": 6594,
            "url": "https://replicate.com/fofr/video-morpher",
            "visibility": "public",
            "hardware": "Nvidia A40 (Large) GPU",
        }

    @classmethod
    def return_type(cls):
        return VideoRef

    mode: Mode = Field(
        description="Determines if you produce a quick experimental video or an upscaled interpolated one. (small ~20s, medium ~60s, upscaled ~2min, upscaled-and-interpolated ~4min)",
        default=Mode("medium"),
    )
    seed: int | None = Field(
        title="Seed",
        description="Set a seed for reproducibility. Random by default.",
        default=None,
    )
    prompt: str = Field(
        title="Prompt",
        description="The prompt has a small effect, but most of the video is driven by the subject images",
        default="",
    )
    checkpoint: Checkpoint = Field(
        description="The checkpoint to use for the model",
        default=Checkpoint("realistic"),
    )
    style_image: ImageRef = Field(
        default=ImageRef(),
        description="Apply the style from this image to the whole video",
    )
    aspect_ratio: Aspect_ratio = Field(
        description="The aspect ratio of the video", default=Aspect_ratio("2:3")
    )
    style_strength: float = Field(
        title="Style Strength",
        description="How strong the style is applied",
        ge=0.0,
        le=2.0,
        default=1,
    )
    use_controlnet: bool = Field(
        title="Use Controlnet",
        description="Use geometric circles to guide the generation",
        default=True,
    )
    negative_prompt: str = Field(
        title="Negative Prompt",
        description="What you do not want to see in the video",
        default="",
    )
    subject_image_1: ImageRef = Field(
        default=ImageRef(), description="The first subject of the video"
    )
    subject_image_2: ImageRef = Field(
        default=ImageRef(), description="The second subject of the video"
    )
    subject_image_3: ImageRef = Field(
        default=ImageRef(), description="The third subject of the video"
    )
    subject_image_4: ImageRef = Field(
        default=ImageRef(), description="The fourth subject of the video"
    )


class HotshotXL(ReplicateNode):
    """😊 Hotshot-XL is an AI text-to-GIF model trained to work alongside Stable Diffusion XL"""

    class Width(int, Enum):
        _256 = 256
        _320 = 320
        _384 = 384
        _448 = 448
        _512 = 512
        _576 = 576
        _640 = 640
        _672 = 672
        _704 = 704
        _768 = 768
        _832 = 832
        _896 = 896
        _960 = 960
        _1024 = 1024

    class Height(int, Enum):
        _256 = 256
        _320 = 320
        _384 = 384
        _448 = 448
        _512 = 512
        _576 = 576
        _640 = 640
        _672 = 672
        _704 = 704
        _768 = 768
        _832 = 832
        _896 = 896
        _960 = 960
        _1024 = 1024

    class Scheduler(str, Enum):
        DDIMSCHEDULER = "DDIMScheduler"
        DPMSOLVERMULTISTEPSCHEDULER = "DPMSolverMultistepScheduler"
        HEUNDISCRETESCHEDULER = "HeunDiscreteScheduler"
        KARRASDPM = "KarrasDPM"
        EULERANCESTRALDISCRETESCHEDULER = "EulerAncestralDiscreteScheduler"
        EULERDISCRETESCHEDULER = "EulerDiscreteScheduler"
        PNDMSCHEDULER = "PNDMScheduler"

    @classmethod
    def replicate_model_id(cls):
        return "lucataco/hotshot-xl:78b3a6257e16e4b241245d65c8b2b81ea2e1ff7ed4c55306b511509ddbfd327a"

    @classmethod
    def get_hardware(cls):
        return "Nvidia A40 GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/ed1749eb-87a6-45a9-bff3-cac89b7df97a/output.gif",
            "created_at": "2023-10-05T04:09:21.646870Z",
            "description": "😊 Hotshot-XL is an AI text-to-GIF model trained to work alongside Stable Diffusion XL",
            "github_url": "https://github.com/lucataco/cog-hotshot-xl",
            "license_url": "https://github.com/hotshotco/Hotshot-XL/blob/main/LICENSE",
            "name": "hotshot-xl",
            "owner": "lucataco",
            "paper_url": "https://huggingface.co/hotshotco/SDXL-512",
            "run_count": 103080,
            "url": "https://replicate.com/lucataco/hotshot-xl",
            "visibility": "public",
            "hardware": "Nvidia A40 GPU",
        }

    @classmethod
    def return_type(cls):
        return VideoRef

    mp4: bool = Field(
        title="Mp4", description="Save as mp4, False for GIF", default=False
    )
    seed: int | None = Field(
        title="Seed",
        description="Random seed. Leave blank to randomize the seed",
        default=None,
    )
    steps: int = Field(
        title="Steps",
        description="Number of denoising steps",
        ge=1.0,
        le=500.0,
        default=30,
    )
    width: Width = Field(description="Width of the output", default=Width(672))
    height: Height = Field(description="Height of the output", default=Height(384))
    prompt: str = Field(
        title="Prompt",
        description="Input prompt",
        default="a camel smoking a cigarette, hd, high quality",
    )
    scheduler: Scheduler = Field(
        description="Select a Scheduler",
        default=Scheduler("EulerAncestralDiscreteScheduler"),
    )
    negative_prompt: str = Field(
        title="Negative Prompt", description="Negative prompt", default="blurry"
    )


class AnimateDiff(ReplicateNode):
    """🎨 AnimateDiff (w/ MotionLoRAs for Panning, Zooming, etc): Animate Your Personalized Text-to-Image Diffusion Models without Specific Tuning"""

    class Base_model(str, Enum):
        REALISTICVISIONV20_V20 = "realisticVisionV20_v20"
        LYRIEL_V16 = "lyriel_v16"
        MAJICMIXREALISTIC_V5PREVIEW = "majicmixRealistic_v5Preview"
        RCNZCARTOON3D_V10 = "rcnzCartoon3d_v10"
        TOONYOU_BETA3 = "toonyou_beta3"

    class Output_format(str, Enum):
        MP4 = "mp4"
        GIF = "gif"

    @classmethod
    def replicate_model_id(cls):
        return "zsxkib/animate-diff:269a616c8b0c2bbc12fc15fd51bb202b11e94ff0f7786c026aa905305c4ed9fb"

    @classmethod
    def get_hardware(cls):
        return "Nvidia A40 GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/336d5c4e-4fd1-415a-a3f7-4a40fa5bdf2b/a_middle-aged_woman_utilizing__zo.gif",
            "created_at": "2023-09-26T19:55:56.734880Z",
            "description": "🎨 AnimateDiff (w/ MotionLoRAs for Panning, Zooming, etc): Animate Your Personalized Text-to-Image Diffusion Models without Specific Tuning",
            "github_url": "https://github.com/guoyww/AnimateDiff",
            "license_url": "https://github.com/guoyww/AnimateDiff/blob/main/LICENSE.txt",
            "name": "animate-diff",
            "owner": "zsxkib",
            "paper_url": "https://arxiv.org/abs/2307.04725",
            "run_count": 39493,
            "url": "https://replicate.com/zsxkib/animate-diff",
            "visibility": "public",
            "hardware": "Nvidia A40 GPU",
        }

    @classmethod
    def return_type(cls):
        return VideoRef

    seed: int = Field(
        title="Seed",
        description="Seed for different images and reproducibility. Use -1 to randomise seed",
        default=-1,
    )
    steps: int = Field(
        title="Steps",
        description="Number of inference steps",
        ge=1.0,
        le=100.0,
        default=25,
    )
    width: int = Field(title="Width", description="Width in pixels", default=512)
    frames: int = Field(
        title="Frames",
        description="Length of the video in frames (playback is at 8 fps e.g. 16 frames @ 8 fps is 2 seconds)",
        ge=1.0,
        le=32.0,
        default=16,
    )
    height: int = Field(title="Height", description="Height in pixels", default=512)
    prompt: str = Field(
        title="Prompt",
        default="photo of vocano, rocks, storm weather, wind, lava waves, lightning, 8k uhd, dslr, soft lighting, high quality, film grain, Fujifilm XT3",
    )
    base_model: Base_model = Field(
        description="Select a base model (DreamBooth checkpoint)",
        default=Base_model("realisticVisionV20_v20"),
    )
    output_format: Output_format = Field(
        description="Output format of the video. Can be 'mp4' or 'gif'",
        default=Output_format("mp4"),
    )
    guidance_scale: float = Field(
        title="Guidance Scale",
        description="Guidance Scale. How closely do we want to adhere to the prompt and its contents",
        ge=0.0,
        le=20.0,
        default=7.5,
    )
    negative_prompt: str = Field(
        title="Negative Prompt",
        default="blur, haze, deformed iris, deformed pupils, semi-realistic, cgi, 3d, render, sketch, cartoon, drawing, anime, mutated hands and fingers, deformed, distorted, disfigured, poorly drawn, bad anatomy, wrong anatomy, extra limb, missing limb, floating limbs, disconnected limbs, mutation, mutated, ugly, disgusting, amputation",
    )
    pan_up_motion_strength: float = Field(
        title="Pan Up Motion Strength",
        description="Strength of Pan Up Motion LoRA. 0 disables the LoRA",
        ge=0.0,
        le=1.0,
        default=0,
    )
    zoom_in_motion_strength: float = Field(
        title="Zoom In Motion Strength",
        description="Strength of Zoom In Motion LoRA. 0 disables the LoRA",
        ge=0.0,
        le=1.0,
        default=0,
    )
    pan_down_motion_strength: float = Field(
        title="Pan Down Motion Strength",
        description="Strength of Pan Down Motion LoRA. 0 disables the LoRA",
        ge=0.0,
        le=1.0,
        default=0,
    )
    pan_left_motion_strength: float = Field(
        title="Pan Left Motion Strength",
        description="Strength of Pan Left Motion LoRA. 0 disables the LoRA",
        ge=0.0,
        le=1.0,
        default=0,
    )
    zoom_out_motion_strength: float = Field(
        title="Zoom Out Motion Strength",
        description="Strength of Zoom Out Motion LoRA. 0 disables the LoRA",
        ge=0.0,
        le=1.0,
        default=0,
    )
    pan_right_motion_strength: float = Field(
        title="Pan Right Motion Strength",
        description="Strength of Pan Right Motion LoRA. 0 disables the LoRA",
        ge=0.0,
        le=1.0,
        default=0,
    )
    rolling_clockwise_motion_strength: float = Field(
        title="Rolling Clockwise Motion Strength",
        description="Strength of Rolling Clockwise Motion LoRA. 0 disables the LoRA",
        ge=0.0,
        le=1.0,
        default=0,
    )
    rolling_anticlockwise_motion_strength: float = Field(
        title="Rolling Anticlockwise Motion Strength",
        description="Strength of Rolling Anticlockwise Motion LoRA. 0 disables the LoRA",
        ge=0.0,
        le=1.0,
        default=0,
    )


class Tooncrafter(ReplicateNode):
    """Create videos from illustrated input images"""

    @classmethod
    def replicate_model_id(cls):
        return "fofr/tooncrafter:51bf654d60d307ab45c4ffe09546a3c9606f8f33861ab28f5bb0e43ad3fa40ed"

    @classmethod
    def get_hardware(cls):
        return "Nvidia A100 (40GB) GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/e3adaa0a-c534-496c-81d1-281f9000fbb4/tooncrafter.gif",
            "created_at": "2024-06-02T21:29:15.300292Z",
            "description": "Create videos from illustrated input images",
            "github_url": "https://github.com/fofr/cog-comfyui-tooncrafter",
            "license_url": "https://github.com/fofr/cog-comfyui-tooncrafter/blob/main/LICENSE",
            "name": "tooncrafter",
            "owner": "fofr",
            "paper_url": "https://doubiiu.github.io/projects/ToonCrafter/",
            "run_count": 8583,
            "url": "https://replicate.com/fofr/tooncrafter",
            "visibility": "public",
            "hardware": "Nvidia A100 (40GB) GPU",
        }

    @classmethod
    def return_type(cls):
        return VideoRef

    loop: bool = Field(title="Loop", description="Loop the video", default=False)
    seed: int | None = Field(
        title="Seed",
        description="Set a seed for reproducibility. Random by default.",
        default=None,
    )
    prompt: str = Field(title="Prompt", default="")
    image_1: ImageRef = Field(default=ImageRef(), description="First input image")
    image_2: ImageRef = Field(default=ImageRef(), description="Second input image")
    image_3: ImageRef = Field(
        default=ImageRef(), description="Third input image (optional)"
    )
    image_4: ImageRef = Field(
        default=ImageRef(), description="Fourth input image (optional)"
    )
    image_5: ImageRef = Field(
        default=ImageRef(), description="Fifth input image (optional)"
    )
    image_6: ImageRef = Field(
        default=ImageRef(), description="Sixth input image (optional)"
    )
    image_7: ImageRef = Field(
        default=ImageRef(), description="Seventh input image (optional)"
    )
    image_8: ImageRef = Field(
        default=ImageRef(), description="Eighth input image (optional)"
    )
    image_9: ImageRef = Field(
        default=ImageRef(), description="Ninth input image (optional)"
    )
    image_10: ImageRef = Field(
        default=ImageRef(), description="Tenth input image (optional)"
    )
    max_width: int = Field(
        title="Max Width",
        description="Maximum width of the video",
        ge=256.0,
        le=768.0,
        default=512,
    )
    max_height: int = Field(
        title="Max Height",
        description="Maximum height of the video",
        ge=256.0,
        le=768.0,
        default=512,
    )
    interpolate: bool = Field(
        title="Interpolate",
        description="Enable 2x interpolation using FILM",
        default=False,
    )
    negative_prompt: str = Field(
        title="Negative Prompt",
        description="Things you do not want to see in your video",
        default="",
    )
    color_correction: bool = Field(
        title="Color Correction",
        description="If the colors are coming out strange, or if the colors between your input images are very different, disable this",
        default=True,
    )


class Zeroscope_V2_XL(ReplicateNode):
    """Zeroscope V2 XL & 576w"""

    class Model(str, Enum):
        XL = "xl"
        _576W = "576w"
        POTAT1 = "potat1"
        ANIMOV_512X = "animov-512x"

    @classmethod
    def replicate_model_id(cls):
        return "anotherjesse/zeroscope-v2-xl:9f747673945c62801b13b84701c783929c0ee784e4748ec062204894dda1a351"

    @classmethod
    def get_hardware(cls):
        return "Nvidia A100 (40GB) GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/021a0a2e-b57b-4b45-a5c7-e29773aa5345/1mrNnh8.png",
            "created_at": "2023-06-24T18:30:41.874899Z",
            "description": "Zeroscope V2 XL & 576w",
            "github_url": "https://github.com/anotherjesse/cog-text2video",
            "license_url": "https://github.com/anotherjesse/cog-text2video/blob/main/LICENSE",
            "name": "zeroscope-v2-xl",
            "owner": "anotherjesse",
            "paper_url": "https://huggingface.co/cerspense/zeroscope_v2_576w",
            "run_count": 262471,
            "url": "https://replicate.com/anotherjesse/zeroscope-v2-xl",
            "visibility": "public",
            "hardware": "Nvidia A100 (40GB) GPU",
        }

    @classmethod
    def return_type(cls):
        return VideoRef

    fps: int = Field(title="Fps", description="fps for the output video", default=8)
    seed: int | None = Field(
        title="Seed",
        description="Random seed. Leave blank to randomize the seed",
        default=None,
    )
    model: Model = Field(description="Model to use", default=Model("xl"))
    width: int = Field(
        title="Width", description="Width of the output video", ge=256.0, default=576
    )
    height: int = Field(
        title="Height", description="Height of the output video", ge=256.0, default=320
    )
    prompt: str = Field(
        title="Prompt",
        description="Input prompt",
        default="An astronaut riding a horse",
    )
    batch_size: int = Field(
        title="Batch Size", description="Batch size", ge=1.0, default=1
    )
    init_video: str | None = Field(
        title="Init Video",
        description="URL of the initial video (optional)",
        default=None,
    )
    num_frames: int = Field(
        title="Num Frames",
        description="Number of frames for the output video",
        default=24,
    )
    init_weight: float = Field(
        title="Init Weight", description="Strength of init_video", default=0.5
    )
    guidance_scale: float = Field(
        title="Guidance Scale",
        description="Guidance scale",
        ge=1.0,
        le=100.0,
        default=7.5,
    )
    negative_prompt: str | None = Field(
        title="Negative Prompt", description="Negative prompt", default=None
    )
    remove_watermark: bool = Field(
        title="Remove Watermark", description="Remove watermark", default=False
    )
    num_inference_steps: int = Field(
        title="Num Inference Steps",
        description="Number of denoising steps",
        ge=1.0,
        le=500.0,
        default=50,
    )


class RobustVideoMatting(ReplicateNode):
    """extract foreground of a video"""

    class Output_type(str, Enum):
        GREEN_SCREEN = "green-screen"
        ALPHA_MASK = "alpha-mask"
        FOREGROUND_MASK = "foreground-mask"

    @classmethod
    def replicate_model_id(cls):
        return "arielreplicate/robust_video_matting:73d2128a371922d5d1abf0712a1d974be0e4e2358cc1218e4e34714767232bac"

    @classmethod
    def get_hardware(cls):
        return "Nvidia T4 GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/1f92fd8f-2b90-4998-b5ae-1e23678ab004/showreel.gif",
            "created_at": "2022-11-25T14:06:18.152759Z",
            "description": "extract foreground of a video",
            "github_url": "https://github.com/PeterL1n/RobustVideoMatting",
            "license_url": "https://github.com/PeterL1n/RobustVideoMatting/blob/master/LICENSE",
            "name": "robust_video_matting",
            "owner": "arielreplicate",
            "paper_url": "https://arxiv.org/abs/2108.11515",
            "run_count": 44518,
            "url": "https://replicate.com/arielreplicate/robust_video_matting",
            "visibility": "public",
            "hardware": "Nvidia T4 GPU",
        }

    @classmethod
    def return_type(cls):
        return VideoRef

    input_video: VideoRef = Field(default=VideoRef(), description="Video to segment.")
    output_type: Output_type = Field(default=Output_type("green-screen"))


class StableDiffusionInfiniteZoom(ReplicateNode):
    """Use Runway's Stable-diffusion inpainting model to create an infinite loop video"""

    class Output_format(str, Enum):
        MP4 = "mp4"
        GIF = "gif"

    @classmethod
    def replicate_model_id(cls):
        return "arielreplicate/stable_diffusion_infinite_zoom:a2527c5074fc0cf9fa6015a40d75d080d1ddf7082fabe142f1ccd882c18fce61"

    @classmethod
    def get_hardware(cls):
        return "Nvidia A100 (40GB) GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/0d244e1c-0f30-49ee-acb4-6a451c27f82f/infinite_zoom.gif",
            "created_at": "2022-10-30T16:19:54.154872Z",
            "description": "Use Runway's Stable-diffusion inpainting model to create an infinite loop video",
            "github_url": "https://github.com/ArielReplicate/stable-diffusion-infinite-zoom",
            "license_url": "https://github.com/ArielReplicate/stable-diffusion-infinite-zoom/blob/add-cog/LICENSE",
            "name": "stable_diffusion_infinite_zoom",
            "owner": "arielreplicate",
            "paper_url": None,
            "run_count": 35819,
            "url": "https://replicate.com/arielreplicate/stable_diffusion_infinite_zoom",
            "visibility": "public",
            "hardware": "Nvidia A100 (40GB) GPU",
        }

    @classmethod
    def return_type(cls):
        return VideoRef

    prompt: str | None = Field(title="Prompt", description="Prompt", default=None)
    inpaint_iter: int = Field(
        title="Inpaint Iter",
        description="Number of iterations of pasting the image in it's center and inpainting the boarders",
        default=2,
    )
    output_format: Output_format = Field(
        description="infinite loop gif or mp4 video", default=Output_format("mp4")
    )


class AnimateDiffIllusions(ReplicateNode):
    """Monster Labs' Controlnet QR Code Monster v2 For SD-1.5 on top of AnimateDiff Prompt Travel (Motion Module SD 1.5 v2)"""

    class Scheduler(str, Enum):
        DDIM = "ddim"
        PNDM = "pndm"
        HEUN = "heun"
        UNIPC = "unipc"
        EULER = "euler"
        EULER_A = "euler_a"
        LMS = "lms"
        K_LMS = "k_lms"
        DPM_2 = "dpm_2"
        K_DPM_2 = "k_dpm_2"
        DPM_2_A = "dpm_2_a"
        K_DPM_2_A = "k_dpm_2_a"
        DPMPP_2M = "dpmpp_2m"
        K_DPMPP_2M = "k_dpmpp_2m"
        DPMPP_SDE = "dpmpp_sde"
        K_DPMPP_SDE = "k_dpmpp_sde"
        DPMPP_2M_SDE = "dpmpp_2m_sde"
        K_DPMPP_2M_SDE = "k_dpmpp_2m_sde"

    class Base_model(str, Enum):
        REALISTICVISIONV40_V20NOVAE = "realisticVisionV40_v20Novae"
        LYRIEL_V16 = "lyriel_v16"
        MAJICMIXREALISTIC_V5PREVIEW = "majicmixRealistic_v5Preview"
        RCNZCARTOON3D_V10 = "rcnzCartoon3d_v10"
        TOONYOU_BETA3 = "toonyou_beta3"
        CUSTOM = "CUSTOM"

    class Output_format(str, Enum):
        MP4 = "mp4"
        GIF = "gif"

    @classmethod
    def replicate_model_id(cls):
        return "zsxkib/animatediff-illusions:b3ccb0101402aafd04bfea042950be606223e2abedbad93cf848bfffa072bb61"

    @classmethod
    def get_hardware(cls):
        return "Nvidia A40 (Large) GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/f6b87381-05b4-44d2-a1fd-f6bf45cf2580/output.gif",
            "created_at": "2023-10-26T12:08:10.288839Z",
            "description": "Monster Labs' Controlnet QR Code Monster v2 For SD-1.5 on top of AnimateDiff Prompt Travel (Motion Module SD 1.5 v2)",
            "github_url": "https://github.com/s9roll7/animatediff-cli-prompt-travel",
            "license_url": "https://github.com/s9roll7/animatediff-cli-prompt-travel/blob/main/LICENSE.md",
            "name": "animatediff-illusions",
            "owner": "zsxkib",
            "paper_url": "https://arxiv.org/abs/2307.04725",
            "run_count": 8435,
            "url": "https://replicate.com/zsxkib/animatediff-illusions",
            "visibility": "public",
            "hardware": "Nvidia A40 (Large) GPU",
        }

    @classmethod
    def return_type(cls):
        return VideoRef

    loop: bool = Field(
        title="Loop",
        description="Flag to loop the video. Use when you have an 'infinitely' repeating video/gif ControlNet video",
        default=True,
    )
    seed: int | None = Field(
        title="Seed",
        description="Seed for different images and reproducibility. Leave blank to randomise seed",
        default=None,
    )
    steps: int = Field(
        title="Steps",
        description="Number of inference steps",
        ge=1.0,
        le=100.0,
        default=25,
    )
    width: int = Field(
        title="Width",
        description="Width of generated video in pixels, must be divisable by 8",
        ge=64.0,
        le=2160.0,
        default=256,
    )
    frames: int = Field(
        title="Frames",
        description="Length of the video in frames (playback is at 8 fps e.g. 16 frames @ 8 fps is 2 seconds)",
        ge=1.0,
        le=1024.0,
        default=128,
    )
    height: int = Field(
        title="Height",
        description="Height of generated video in pixels, must be divisable by 8",
        ge=64.0,
        le=2160.0,
        default=384,
    )
    context: int = Field(
        title="Context",
        description="Number of frames to condition on (default: max of <length> or 32). max for motion module v1 is 24",
        ge=1.0,
        le=32.0,
        default=16,
    )
    clip_skip: int = Field(
        title="Clip Skip",
        description="Skip the last N-1 layers of the CLIP text encoder (lower values follow prompt more closely)",
        ge=1.0,
        le=6.0,
        default=2,
    )
    scheduler: Scheduler = Field(
        description="Diffusion scheduler", default=Scheduler("k_dpmpp_sde")
    )
    base_model: Base_model = Field(
        description="Choose the base model for animation generation. If 'CUSTOM' is selected, provide a custom model URL in the next parameter",
        default=Base_model("majicmixRealistic_v5Preview"),
    )
    prompt_map: str = Field(
        title="Prompt Map",
        description="Prompt for changes in animation. Provide 'frame number : prompt at this frame', separate different prompts with '|'. Make sure the frame number does not exceed the length of video (frames)",
        default="",
    )
    head_prompt: str = Field(
        title="Head Prompt",
        description="Primary animation prompt. If a prompt map is provided, this will be prefixed at the start of every individual prompt in the map",
        default="masterpiece, best quality, a haunting and detailed depiction of a ship at sea, battered by waves, ominous,((dark clouds:1.3)),distant lightning, rough seas, rain, silhouette of the ship against the stormy sky",
    )
    tail_prompt: str = Field(
        title="Tail Prompt",
        description="Additional prompt that will be appended at the end of the main prompt or individual prompts in the map",
        default="",
    )
    output_format: Output_format = Field(
        description="Output format of the video. Can be 'mp4' or 'gif'",
        default=Output_format("mp4"),
    )
    guidance_scale: float = Field(
        title="Guidance Scale",
        description="Guidance Scale. How closely do we want to adhere to the prompt and its contents",
        ge=0.0,
        le=20.0,
        default=7.5,
    )
    negative_prompt: str = Field(title="Negative Prompt", default="")
    controlnet_video: VideoRef = Field(
        default=VideoRef(),
        description="A short video/gif that will be used as the keyframes for QR Code Monster to use, Please note, all of the frames will be used as keyframes",
    )
    film_interpolation: bool = Field(
        title="Film Interpolation",
        description="Whether to use FILM for between-frame interpolation (film-net.github.io)",
        default=True,
    )
    prompt_fixed_ratio: float = Field(
        title="Prompt Fixed Ratio",
        description="Defines the ratio of adherence to the fixed part of the prompt versus the dynamic part (from prompt map). Value should be between 0 (only dynamic) to 1 (only fixed).",
        ge=0.0,
        le=1.0,
        default=0.5,
    )
    custom_base_model_url: str = Field(
        title="Custom Base Model Url",
        description="Only used when base model is set to 'CUSTOM'. URL of the custom model to download if 'CUSTOM' is selected in the base model. Only downloads from 'https://civitai.com/api/download/models/' are allowed",
        default="",
    )
    num_interpolation_steps: int = Field(
        title="Num Interpolation Steps",
        description="Number of steps to interpolate between animation frames",
        ge=1.0,
        le=50.0,
        default=3,
    )
    enable_qr_code_monster_v2: bool = Field(
        title="Enable Qr Code Monster V2",
        description="Flag to enable QR Code Monster V2 ControlNet",
        default=True,
    )
    playback_frames_per_second: int = Field(
        title="Playback Frames Per Second", ge=1.0, le=60.0, default=8
    )
    controlnet_conditioning_scale: float = Field(
        title="Controlnet Conditioning Scale",
        description="Strength of ControlNet. The outputs of the ControlNet are multiplied by `controlnet_conditioning_scale` before they are added to the residual in the original UNet",
        default=0.18,
    )
    qr_code_monster_v2_guess_mode: bool = Field(
        title="Qr Code Monster V2 Guess Mode",
        description="Flag to enable guess mode (un-guided) for QR Code Monster V2 ControlNet",
        default=False,
    )
    qr_code_monster_v2_preprocessor: bool = Field(
        title="Qr Code Monster V2 Preprocessor",
        description="Flag to pre-process keyframes for QR Code Monster V2 ControlNet",
        default=True,
    )


class AudioToWaveform(ReplicateNode):
    """Create a waveform video from audio"""

    @classmethod
    def replicate_model_id(cls):
        return "fofr/audio-to-waveform:116cf9b97d0a117cfe64310637bf99ae8542cc35d813744c6ab178a3e134ff5a"

    @classmethod
    def get_hardware(cls):
        return "CPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/5d5cad9c-d4ba-44e1-8c4f-dc08648bbf5e/fofr_a_waveform_bar_chart_video_e.png",
            "created_at": "2023-06-13T15:26:38.672021Z",
            "description": "Create a waveform video from audio",
            "github_url": "https://github.com/fofr/audio-to-waveform",
            "license_url": "https://github.com/fofr/audio-to-waveform/blob/main/LICENSE",
            "name": "audio-to-waveform",
            "owner": "fofr",
            "paper_url": "https://gradio.app/docs/#make_waveform",
            "run_count": 369138,
            "url": "https://replicate.com/fofr/audio-to-waveform",
            "visibility": "public",
            "hardware": "CPU",
        }

    @classmethod
    def return_type(cls):
        return VideoRef

    audio: AudioRef = Field(
        default=AudioRef(), description="Audio file to create waveform from"
    )
    bg_color: str = Field(
        title="Bg Color", description="Background color of waveform", default="#000000"
    )
    fg_alpha: float = Field(
        title="Fg Alpha", description="Opacity of foreground waveform", default=0.75
    )
    bar_count: int = Field(
        title="Bar Count", description="Number of bars in waveform", default=100
    )
    bar_width: float = Field(
        title="Bar Width",
        description="Width of bars in waveform. 1 represents full width, 0.5 represents half width, etc.",
        default=0.4,
    )
    bars_color: str = Field(
        title="Bars Color", description="Color of waveform bars", default="#ffffff"
    )
    caption_text: str = Field(
        title="Caption Text", description="Caption text for the video", default=""
    )
