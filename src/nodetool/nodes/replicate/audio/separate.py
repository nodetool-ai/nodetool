from pydantic import BaseModel, Field
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode
from nodetool.providers.replicate.replicate_node import ReplicateNode
from enum import Enum


class Demucs(ReplicateNode):
    """Demucs is an audio source separator created by Facebook Research."""

    class Stem(str, Enum):
        NONE = "none"
        DRUMS = "drums"
        BASS = "bass"
        OTHER = "other"
        VOCALS = "vocals"
        GUITAR = "guitar"
        PIANO = "piano"

    class Model(str, Enum):
        HTDEMUCS = "htdemucs"
        HTDEMUCS_FT = "htdemucs_ft"
        HTDEMUCS_6S = "htdemucs_6s"
        HDEMUCS_MMI = "hdemucs_mmi"
        MDX_Q = "mdx_q"
        MDX_EXTRA_Q = "mdx_extra_q"

    class Clip_mode(str, Enum):
        RESCALE = "rescale"
        CLAMP = "clamp"
        NONE = "none"

    class Mp3_preset(int, Enum):
        _2 = 2
        _3 = 3
        _4 = 4
        _5 = 5
        _6 = 6
        _7 = 7

    class Wav_format(str, Enum):
        INT16 = "int16"
        INT24 = "int24"
        FLOAT32 = "float32"

    class Output_format(str, Enum):
        MP3 = "mp3"
        FLAC = "flac"
        WAV = "wav"

    @classmethod
    def replicate_model_id(cls):
        return "ryan5453/demucs:53191dee0efbfc3cbfdbab276b0dcce930705e9a4d1bb9fe1e2a7cdd33d9ca82"

    @classmethod
    def get_hardware(cls):
        return "Nvidia A40 GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/c13b51bf-69a4-474e-ad73-d800466ca357/588ff17a-e9c9-49c7-b572-e1b189d87.png",
            "created_at": "2022-11-08T22:25:48.183283Z",
            "description": "Demucs is an audio source separator created by Facebook Research.",
            "github_url": "https://github.com/ryan5453/demucs-cog",
            "license_url": "https://github.com/ryan5453/demucs-cog/blob/main/LICENSE",
            "name": "demucs",
            "owner": "ryan5453",
            "paper_url": "https://arxiv.org/abs/2111.03600",
            "run_count": 342154,
            "url": "https://replicate.com/ryan5453/demucs",
            "visibility": "public",
            "hardware": "Nvidia A40 GPU",
        }

    @classmethod
    def return_type(cls):
        return {
            "vocals": AudioRef,
            "drums": AudioRef,
            "bass": AudioRef,
            "other": AudioRef,
        }

    jobs: int = Field(
        title="Jobs",
        description="Choose the number of parallel jobs to use for separation.",
        default=0,
    )
    stem: Stem = Field(
        description="If you just want to isolate one stem, you can choose it here.",
        default=Stem("none"),
    )
    audio: AudioRef = Field(
        default=AudioRef(), description="Upload the file to be processed here."
    )
    model: Model = Field(
        description="Choose the demucs audio that proccesses your audio. The readme has more information on what to choose.",
        default=Model("htdemucs"),
    )
    split: bool = Field(
        title="Split",
        description="Choose whether or not the audio should be split into chunks.",
        default=True,
    )
    shifts: int = Field(
        title="Shifts",
        description="Choose the amount random shifts for equivariant stabilization. This performs multiple predictions with random shifts of the input and averages them, which makes it x times slower.",
        default=1,
    )
    overlap: float = Field(
        title="Overlap",
        description="Choose the amount of overlap between prediction windows.",
        default=0.25,
    )
    segment: int | None = Field(
        title="Segment",
        description="Choose the segment length to use for separation.",
        default=None,
    )
    clip_mode: Clip_mode = Field(
        description="Choose the strategy for avoiding clipping. Rescale will rescale entire signal if necessary or clamp will allow hard clipping.",
        default=Clip_mode("rescale"),
    )
    mp3_preset: Mp3_preset = Field(
        description="Choose the preset for the MP3 output. Higher is faster but worse quality. If MP3 is not selected as the output type, this has no effect.",
        default=Mp3_preset(2),
    )
    wav_format: Wav_format = Field(
        description="Choose format for the WAV output. If WAV is not selected as the output type, this has no effect.",
        default=Wav_format("int24"),
    )
    mp3_bitrate: int = Field(
        title="Mp3 Bitrate",
        description="Choose the bitrate for the MP3 output. Higher is better quality but larger file size. If MP3 is not selected as the output type, this has no effect.",
        default=320,
    )
    output_format: Output_format = Field(
        description="Choose the audio format you would like the result to be returned in.",
        default=Output_format("mp3"),
    )
