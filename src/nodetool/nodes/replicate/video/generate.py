from pydantic import BaseModel, Field
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode
from nodetool.providers.replicate.replicate_node import ReplicateNode
from enum import Enum


class Ray(ReplicateNode):
    """Fast, high quality text-to-video and image-to-video (Also known as Dream Machine)"""

    class Aspect_ratio(str, Enum):
        _1_1 = "1:1"
        _3_4 = "3:4"
        _4_3 = "4:3"
        _9_16 = "9:16"
        _16_9 = "16:9"
        _9_21 = "9:21"
        _21_9 = "21:9"

    @classmethod
    def get_basic_fields(cls):
        return ["loop", "prompt", "aspect_ratio"]

    @classmethod
    def replicate_model_id(cls):
        return (
            "luma/ray:8af469846e8ba045167fb3f1570af72f6545901b2d815b851aa36e5c33b5e1e5"
        )

    @classmethod
    def get_hardware(cls):
        return "None"

    @classmethod
    def get_model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_featured_image/496f8ab2-3a87-4fe7-9867-5572460c2b5e/ray-cover.webp",
            "created_at": "2024-12-12T16:30:42.287210Z",
            "description": "Fast, high quality text-to-video and image-to-video (Also known as Dream Machine)",
            "github_url": None,
            "license_url": "https://lumalabs.ai/dream-machine/api/terms",
            "name": "ray",
            "owner": "luma",
            "paper_url": "https://lumalabs.ai/dream-machine",
            "run_count": 6683,
            "url": "https://replicate.com/luma/ray",
            "visibility": "public",
            "weights_url": None,
        }

    @classmethod
    def return_type(cls):
        return VideoRef

    loop: bool = Field(
        title="Loop", description="Whether the video should loop", default=False
    )
    prompt: str | None = Field(
        title="Prompt", description="Text prompt for video generation", default=None
    )
    aspect_ratio: Aspect_ratio = Field(
        description="Aspect ratio of the video (e.g. '16:9'). Ignored if a start or end frame or video ID is given.",
        default=Aspect_ratio("16:9"),
    )
    end_video_id: str | None = Field(
        title="End Video Id",
        description="Prepend a new video generation to the beginning of an existing one (Also called 'reverse extend'). You can combine this with start_image_url, or start_video_id.",
        default=None,
    )
    end_image_url: ImageRef = Field(
        default=ImageRef(), description="URL of an image to use as the ending frame"
    )
    start_video_id: str | None = Field(
        title="Start Video Id",
        description="Continue or extend a video generation with a new generation. You can combine this with end_image_url, or end_video_id.",
        default=None,
    )
    start_image_url: ImageRef = Field(
        default=ImageRef(), description="URL of an image to use as the starting frame"
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
    def get_basic_fields(cls):
        return ["mp4", "seed", "steps"]

    @classmethod
    def replicate_model_id(cls):
        return "lucataco/hotshot-xl:78b3a6257e16e4b241245d65c8b2b81ea2e1ff7ed4c55306b511509ddbfd327a"

    @classmethod
    def get_hardware(cls):
        return "None"

    @classmethod
    def get_model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_featured_image/70393e62-deab-4f95-ace7-eaeb8a9800db/compressed.gif",
            "created_at": "2023-10-05T04:09:21.646870Z",
            "description": "😊 Hotshot-XL is an AI text-to-GIF model trained to work alongside Stable Diffusion XL",
            "github_url": "https://github.com/lucataco/cog-hotshot-xl",
            "license_url": "https://github.com/hotshotco/Hotshot-XL/blob/main/LICENSE",
            "name": "hotshot-xl",
            "owner": "lucataco",
            "paper_url": "https://huggingface.co/hotshotco/SDXL-512",
            "run_count": 428229,
            "url": "https://replicate.com/lucataco/hotshot-xl",
            "visibility": "public",
            "weights_url": None,
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


class Zeroscope_V2_XL(ReplicateNode):
    """Zeroscope V2 XL & 576w"""

    class Model(str, Enum):
        XL = "xl"
        _576W = "576w"
        POTAT1 = "potat1"
        ANIMOV_512X = "animov-512x"

    @classmethod
    def get_basic_fields(cls):
        return ["fps", "seed", "model"]

    @classmethod
    def replicate_model_id(cls):
        return "anotherjesse/zeroscope-v2-xl:9f747673945c62801b13b84701c783929c0ee784e4748ec062204894dda1a351"

    @classmethod
    def get_hardware(cls):
        return "None"

    @classmethod
    def get_model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_featured_image/d56e8888-a591-4edd-a9d3-2285b2ab66b4/1mrNnh8.jpg",
            "created_at": "2023-06-24T18:30:41.874899Z",
            "description": "Zeroscope V2 XL & 576w",
            "github_url": "https://github.com/anotherjesse/cog-text2video",
            "license_url": "https://github.com/anotherjesse/cog-text2video/blob/main/LICENSE",
            "name": "zeroscope-v2-xl",
            "owner": "anotherjesse",
            "paper_url": "https://huggingface.co/cerspense/zeroscope_v2_576w",
            "run_count": 283226,
            "url": "https://replicate.com/anotherjesse/zeroscope-v2-xl",
            "visibility": "public",
            "weights_url": None,
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
    def get_basic_fields(cls):
        return ["input_video", "output_type"]

    @classmethod
    def replicate_model_id(cls):
        return "arielreplicate/robust_video_matting:73d2128a371922d5d1abf0712a1d974be0e4e2358cc1218e4e34714767232bac"

    @classmethod
    def get_hardware(cls):
        return "None"

    @classmethod
    def get_model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/1f92fd8f-2b90-4998-b5ae-1e23678ab004/showreel.gif",
            "created_at": "2022-11-25T14:06:18.152759Z",
            "description": "extract foreground of a video",
            "github_url": "https://github.com/PeterL1n/RobustVideoMatting",
            "license_url": "https://github.com/PeterL1n/RobustVideoMatting/blob/master/LICENSE",
            "name": "robust_video_matting",
            "owner": "arielreplicate",
            "paper_url": "https://arxiv.org/abs/2108.11515",
            "run_count": 48967,
            "url": "https://replicate.com/arielreplicate/robust_video_matting",
            "visibility": "public",
            "weights_url": None,
        }

    @classmethod
    def return_type(cls):
        return VideoRef

    input_video: VideoRef = Field(default=VideoRef(), description="Video to segment.")
    output_type: Output_type = Field(default=Output_type("green-screen"))


class AudioToWaveform(ReplicateNode):
    """Create a waveform video from audio"""

    @classmethod
    def get_basic_fields(cls):
        return ["audio", "bg_color", "fg_alpha"]

    @classmethod
    def replicate_model_id(cls):
        return "fofr/audio-to-waveform:116cf9b97d0a117cfe64310637bf99ae8542cc35d813744c6ab178a3e134ff5a"

    @classmethod
    def get_hardware(cls):
        return "None"

    @classmethod
    def get_model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/5d5cad9c-d4ba-44e1-8c4f-dc08648bbf5e/fofr_a_waveform_bar_chart_video_e.png",
            "created_at": "2023-06-13T15:26:38.672021Z",
            "description": "Create a waveform video from audio",
            "github_url": "https://github.com/fofr/audio-to-waveform",
            "license_url": "https://github.com/fofr/audio-to-waveform/blob/main/LICENSE",
            "name": "audio-to-waveform",
            "owner": "fofr",
            "paper_url": "https://gradio.app/docs/#make_waveform",
            "run_count": 381596,
            "url": "https://replicate.com/fofr/audio-to-waveform",
            "visibility": "public",
            "weights_url": None,
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


class Hunyuan_Video(ReplicateNode):
    """A state-of-the-art text-to-video generation model capable of creating high-quality videos with realistic motion from text descriptions"""

    @classmethod
    def get_basic_fields(cls):
        return ["fps", "seed", "width"]

    @classmethod
    def replicate_model_id(cls):
        return "tencent/hunyuan-video:8283f26be7ce5dc0119324b4752cbfd3970b3ef1b923c4d3c35eb6546518747a"

    @classmethod
    def get_hardware(cls):
        return "None"

    @classmethod
    def get_model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_featured_image/3bebc89d-37c7-47ea-9a7b-a334b76eea87/hunyuan-featured.webp",
            "created_at": "2024-12-03T14:21:37.443615Z",
            "description": "A state-of-the-art text-to-video generation model capable of creating high-quality videos with realistic motion from text descriptions",
            "github_url": "https://github.com/zsxkib/HunyuanVideo/tree/replicate",
            "license_url": "https://huggingface.co/tencent/HunyuanVideo/blob/main/LICENSE",
            "name": "hunyuan-video",
            "owner": "tencent",
            "paper_url": "https://github.com/Tencent/HunyuanVideo/blob/main/assets/hunyuanvideo.pdf",
            "run_count": 28316,
            "url": "https://replicate.com/tencent/hunyuan-video",
            "visibility": "public",
            "weights_url": "https://huggingface.co/tencent/HunyuanVideo",
        }

    @classmethod
    def return_type(cls):
        return VideoRef

    fps: int = Field(
        title="Fps",
        description="Frames per second of the output video",
        ge=1.0,
        default=24,
    )
    seed: int | None = Field(
        title="Seed", description="Random seed (leave empty for random)", default=None
    )
    width: int = Field(
        title="Width",
        description="Width of the video in pixels (must be divisible by 16)",
        ge=16.0,
        default=864,
    )
    height: int = Field(
        title="Height",
        description="Height of the video in pixels (must be divisible by 16)",
        ge=16.0,
        default=480,
    )
    prompt: str = Field(
        title="Prompt",
        description="The prompt to guide the video generation",
        default="A cat walks on the grass, realistic style",
    )
    infer_steps: int = Field(
        title="Infer Steps", description="Number of denoising steps", ge=1.0, default=50
    )
    video_length: int = Field(
        title="Video Length",
        description="Number of frames to generate (must be 4k+1, ex: 49 or 129)",
        ge=1.0,
        default=129,
    )
    embedded_guidance_scale: float = Field(
        title="Embedded Guidance Scale",
        description="Guidance scale",
        ge=1.0,
        le=10.0,
        default=6,
    )


class Video_01_Live(ReplicateNode):
    """An image-to-video (I2V) model specifically trained for Live2D and general animation use cases"""

    @classmethod
    def get_basic_fields(cls):
        return ["prompt", "prompt_optimizer", "first_frame_image"]

    @classmethod
    def replicate_model_id(cls):
        return "minimax/video-01-live:4bce7c1730a5fc582699fb7e630c2e39c3dd4ddb11ca87fa3b7f0fc52537dd09"

    @classmethod
    def get_hardware(cls):
        return "None"

    @classmethod
    def get_model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_featured_image/c202ad97-edd0-40b6-afaf-c99d71398d44/video-01-live-cover.webp",
            "created_at": "2024-12-16T20:27:52.715593Z",
            "description": "An image-to-video (I2V) model specifically trained for Live2D and general animation use cases",
            "github_url": None,
            "license_url": "https://intl.minimaxi.com/protocol/terms-of-service",
            "name": "video-01-live",
            "owner": "minimax",
            "paper_url": None,
            "run_count": 25499,
            "url": "https://replicate.com/minimax/video-01-live",
            "visibility": "public",
            "weights_url": None,
        }

    @classmethod
    def return_type(cls):
        return VideoRef

    prompt: str | None = Field(
        title="Prompt", description="Text prompt for image generation", default=None
    )
    prompt_optimizer: bool = Field(
        title="Prompt Optimizer", description="Use prompt optimizer", default=True
    )
    first_frame_image: str | None = Field(
        title="First Frame Image",
        description="First frame image for video generation",
        default=None,
    )


class Video_01(ReplicateNode):
    """Generate 6s videos with prompts or images. (Also known as Hailuo)"""

    @classmethod
    def get_basic_fields(cls):
        return ["prompt", "prompt_optimizer", "first_frame_image"]

    @classmethod
    def replicate_model_id(cls):
        return "minimax/video-01:6be8dfbbf29ba949b6bce8ca1b93fd8cf24f84f0b246852e98e0a5c7a4c02091"

    @classmethod
    def get_hardware(cls):
        return "None"

    @classmethod
    def get_model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_featured_image/b56c831c-4c68-4443-b69e-b71b105afe7f/minimax.webp",
            "created_at": "2024-11-26T14:40:21.652537Z",
            "description": "Generate 6s videos with prompts or images. (Also known as Hailuo)",
            "github_url": None,
            "license_url": "https://intl.minimaxi.com/protocol/terms-of-service",
            "name": "video-01",
            "owner": "minimax",
            "paper_url": None,
            "run_count": 67585,
            "url": "https://replicate.com/minimax/video-01",
            "visibility": "public",
            "weights_url": None,
        }

    @classmethod
    def return_type(cls):
        return VideoRef

    prompt: str | None = Field(
        title="Prompt", description="Text prompt for image generation", default=None
    )
    prompt_optimizer: bool = Field(
        title="Prompt Optimizer", description="Use prompt optimizer", default=True
    )
    first_frame_image: str | None = Field(
        title="First Frame Image",
        description="First frame image for video generation",
        default=None,
    )


class Music_01(ReplicateNode):
    """Quickly generate up to 1 minute of music with lyrics and vocals in the style of a reference track"""

    class Bitrate(int, Enum):
        _32000 = 32000
        _64000 = 64000
        _128000 = 128000
        _256000 = 256000

    class Sample_rate(int, Enum):
        _16000 = 16000
        _24000 = 24000
        _32000 = 32000
        _44100 = 44100

    @classmethod
    def get_basic_fields(cls):
        return ["lyrics", "bitrate", "voice_id"]

    @classmethod
    def replicate_model_id(cls):
        return "minimax/music-01:a05a52e0512dc0942a782ba75429de791b46a567581f358f4c0c5623d5ff7242"

    @classmethod
    def get_hardware(cls):
        return "None"

    @classmethod
    def get_model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_featured_image/1d2de931-15ff-48b0-9c4d-2f9200eb2913/music-01-cover.jpg",
            "created_at": "2024-12-17T12:40:30.320043Z",
            "description": "Quickly generate up to 1 minute of music with lyrics and vocals in the style of a reference track",
            "github_url": None,
            "license_url": "https://intl.minimaxi.com/protocol/terms-of-service",
            "name": "music-01",
            "owner": "minimax",
            "paper_url": None,
            "run_count": 12066,
            "url": "https://replicate.com/minimax/music-01",
            "visibility": "public",
            "weights_url": None,
        }

    @classmethod
    def return_type(cls):
        return AudioRef

    lyrics: str = Field(
        title="Lyrics",
        description="Lyrics with optional formatting. You can use a newline to separate each line of lyrics. You can use two newlines to add a pause between lines. You can use double hash marks (##) at the beginning and end of the lyrics to add accompaniment.",
        default="",
    )
    bitrate: Bitrate = Field(
        description="Bitrate for the generated music", default=Bitrate(256000)
    )
    voice_id: str | None = Field(
        title="Voice Id",
        description="Reuse a previously uploaded voice ID",
        default=None,
    )
    song_file: AudioRef = Field(
        default=AudioRef(),
        description="Reference song, should contain music and vocals. Must be a .wav or .mp3 file longer than 15 seconds.",
    )
    voice_file: AudioRef = Field(
        default=AudioRef(),
        description="Voice reference. Must be a .wav or .mp3 file longer than 15 seconds. If only a voice reference is given, an a cappella vocal hum will be generated.",
    )
    sample_rate: Sample_rate = Field(
        description="Sample rate for the generated music", default=Sample_rate(44100)
    )
    instrumental_id: str | None = Field(
        title="Instrumental Id",
        description="Reuse a previously uploaded instrumental ID",
        default=None,
    )
    instrumental_file: str | None = Field(
        title="Instrumental File",
        description="Instrumental reference. Must be a .wav or .mp3 file longer than 15 seconds. If only an instrumental reference is given, a track without vocals will be generated.",
        default=None,
    )


class LTX_Video(ReplicateNode):
    """LTX-Video is the first DiT-based video generation model capable of generating high-quality videos in real-time. It produces 24 FPS videos at a 768x512 resolution faster than they can be watched."""

    class Model(str, Enum):
        _0_9_1 = "0.9.1"
        _0_9 = "0.9"

    class Length(int, Enum):
        _97 = 97
        _129 = 129
        _161 = 161
        _193 = 193
        _225 = 225
        _257 = 257

    class Target_size(int, Enum):
        _512 = 512
        _576 = 576
        _640 = 640
        _704 = 704
        _768 = 768
        _832 = 832
        _896 = 896
        _960 = 960
        _1024 = 1024

    class Aspect_ratio(str, Enum):
        _1_1 = "1:1"
        _1_2 = "1:2"
        _2_1 = "2:1"
        _2_3 = "2:3"
        _3_2 = "3:2"
        _3_4 = "3:4"
        _4_3 = "4:3"
        _4_5 = "4:5"
        _5_4 = "5:4"
        _9_16 = "9:16"
        _16_9 = "16:9"
        _9_21 = "9:21"
        _21_9 = "21:9"

    @classmethod
    def get_basic_fields(cls):
        return ["cfg", "seed", "image"]

    @classmethod
    def replicate_model_id(cls):
        return "lightricks/ltx-video:8c47da666861d081eeb4d1261853087de23923a268a69b63febdf5dc1dee08e4"

    @classmethod
    def get_hardware(cls):
        return "None"

    @classmethod
    def get_model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_featured_image/184609cb-a0c5-47c9-8fec-987fb21cc977/replicate-prediction-_QTChmfY.webp",
            "created_at": "2024-11-29T14:15:01.460922Z",
            "description": "LTX-Video is the first DiT-based video generation model capable of generating high-quality videos in real-time. It produces 24 FPS videos at a 768x512 resolution faster than they can be watched.",
            "github_url": "https://github.com/Lightricks/LTX-Video",
            "license_url": "https://github.com/Lightricks/LTX-Video/blob/main/LICENSE",
            "name": "ltx-video",
            "owner": "lightricks",
            "paper_url": None,
            "run_count": 27132,
            "url": "https://replicate.com/lightricks/ltx-video",
            "visibility": "public",
            "weights_url": "https://huggingface.co/Lightricks/LTX-Video",
        }

    @classmethod
    def return_type(cls):
        return VideoRef

    cfg: float = Field(
        title="Cfg",
        description="How strongly the video follows the prompt",
        ge=1.0,
        le=20.0,
        default=3,
    )
    seed: int | None = Field(
        title="Seed",
        description="Set a seed for reproducibility. Random by default.",
        default=None,
    )
    image: ImageRef = Field(
        default=ImageRef(),
        description="Optional input image to use as the starting frame",
    )
    model: Model = Field(description="Model version to use", default=Model("0.9.1"))
    steps: int = Field(
        title="Steps", description="Number of steps", ge=1.0, le=50.0, default=30
    )
    length: Length = Field(
        description="Length of the output video in frames", default=Length(97)
    )
    prompt: str = Field(
        title="Prompt",
        description="Text prompt for the video. This model needs long descriptive prompts, if the prompt is too short the quality won't be good.",
        default="best quality, 4k, HDR, a tracking shot of a beautiful scene",
    )
    target_size: Target_size = Field(
        description="Target size for the output video", default=Target_size(640)
    )
    aspect_ratio: Aspect_ratio = Field(
        description="Aspect ratio of the output video. Ignored if an image is provided.",
        default=Aspect_ratio("3:2"),
    )
    negative_prompt: str = Field(
        title="Negative Prompt",
        description="Things you do not want to see in your video",
        default="low quality, worst quality, deformed, distorted",
    )
    image_noise_scale: float = Field(
        title="Image Noise Scale",
        description="Lower numbers stick more closely to the input image",
        ge=0.0,
        le=1.0,
        default=0.15,
    )
