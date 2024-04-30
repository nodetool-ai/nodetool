from pydantic import BaseModel, Field
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode
from nodetool.common.replicate_node import ReplicateNode
from enum import Enum


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


class HotshotXL(ReplicateNode):
    """😊 Hotshot-XL is an AI text-to-GIF model trained to work alongside Stable Diffusion XL"""

    def replicate_model_id(self):
        return "lucataco/hotshot-xl:78b3a6257e16e4b241245d65c8b2b81ea2e1ff7ed4c55306b511509ddbfd327a"

    def get_hardware(self):
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
            "run_count": 46126,
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
    width: Width = Field(description="Width of the output", default=672)
    height: Height = Field(description="Height of the output", default=384)
    prompt: str = Field(
        title="Prompt",
        description="Input prompt",
        default="a camel smoking a cigarette, hd, high quality",
    )
    scheduler: Scheduler = Field(
        description="Select a Scheduler", default="EulerAncestralDiscreteScheduler"
    )
    negative_prompt: str = Field(
        title="Negative Prompt", description="Negative prompt", default="blurry"
    )


class Base_model(str, Enum):
    REALISTICVISIONV20_V20 = "realisticVisionV20_v20"
    LYRIEL_V16 = "lyriel_v16"
    MAJICMIXREALISTIC_V5PREVIEW = "majicmixRealistic_v5Preview"
    RCNZCARTOON3D_V10 = "rcnzCartoon3d_v10"
    TOONYOU_BETA3 = "toonyou_beta3"


class Output_format(str, Enum):
    MP4 = "mp4"
    GIF = "gif"


class AnimateDiff(ReplicateNode):
    """🎨 AnimateDiff (w/ MotionLoRAs for Panning, Zooming, etc): Animate Your Personalized Text-to-Image Diffusion Models without Specific Tuning"""

    def replicate_model_id(self):
        return "zsxkib/animate-diff:269a616c8b0c2bbc12fc15fd51bb202b11e94ff0f7786c026aa905305c4ed9fb"

    def get_hardware(self):
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
            "run_count": 34022,
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
        default="realisticVisionV20_v20",
    )
    output_format: Output_format = Field(
        description="Output format of the video. Can be 'mp4' or 'gif'", default="mp4"
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


class Model(str, Enum):
    XL = "xl"
    _576W = "576w"
    POTAT1 = "potat1"
    ANIMOV_512X = "animov-512x"


class Zeroscope_V2_XL(ReplicateNode):
    """Zeroscope V2 XL & 576w"""

    def replicate_model_id(self):
        return "anotherjesse/zeroscope-v2-xl:9f747673945c62801b13b84701c783929c0ee784e4748ec062204894dda1a351"

    def get_hardware(self):
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
            "run_count": 244735,
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
    model: Model = Field(description="Model to use", default="xl")
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


class Output_type(str, Enum):
    GREEN_SCREEN = "green-screen"
    ALPHA_MASK = "alpha-mask"
    FOREGROUND_MASK = "foreground-mask"


class RobustVideoMatting(ReplicateNode):
    """extract foreground of a video"""

    def replicate_model_id(self):
        return "arielreplicate/robust_video_matting:73d2128a371922d5d1abf0712a1d974be0e4e2358cc1218e4e34714767232bac"

    def get_hardware(self):
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
            "run_count": 42945,
            "url": "https://replicate.com/arielreplicate/robust_video_matting",
            "visibility": "public",
            "hardware": "Nvidia T4 GPU",
        }

    @classmethod
    def return_type(cls):
        return VideoRef

    input_video: VideoRef = Field(default=VideoRef(), description="Video to segment.")
    output_type: Output_type = Field(default="green-screen")


class StableDiffusionInfiniteZoom(ReplicateNode):
    """Use Runway's Stable-diffusion inpainting model to create an infinite loop video"""

    def replicate_model_id(self):
        return "arielreplicate/stable_diffusion_infinite_zoom:a2527c5074fc0cf9fa6015a40d75d080d1ddf7082fabe142f1ccd882c18fce61"

    def get_hardware(self):
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
            "run_count": 35297,
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
        description="infinite loop gif or mp4 video", default="mp4"
    )


class AnimateDiffIllusions(ReplicateNode):
    """Monster Labs' Controlnet QR Code Monster v2 For SD-1.5 on top of AnimateDiff Prompt Travel (Motion Module SD 1.5 v2)"""

    def replicate_model_id(self):
        return "zsxkib/animatediff-illusions:b3ccb0101402aafd04bfea042950be606223e2abedbad93cf848bfffa072bb61"

    def get_hardware(self):
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
            "run_count": 8029,
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
        description="Diffusion scheduler", default="k_dpmpp_sde"
    )
    base_model: Base_model = Field(
        description="Choose the base model for animation generation. If 'CUSTOM' is selected, provide a custom model URL in the next parameter",
        default="majicmixRealistic_v5Preview",
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
        description="Output format of the video. Can be 'mp4' or 'gif'", default="mp4"
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

    def replicate_model_id(self):
        return "fofr/audio-to-waveform:116cf9b97d0a117cfe64310637bf99ae8542cc35d813744c6ab178a3e134ff5a"

    def get_hardware(self):
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
            "run_count": 307386,
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
