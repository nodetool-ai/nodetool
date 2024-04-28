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


class AudioToWaveform(ReplicateNode):
    """Create a waveform video from audio"""

    def replicate_model_id(self):
        return "fofr/audio-to-waveform:116cf9b97d0a117cfe64310637bf99ae8542cc35d813744c6ab178a3e134ff5a"

    def get_hardware(self):
        return "CPU"

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
