from enum import Enum
from pydantic import Field
from nodetool.common.comfy_node import EnableDisable

from nodetool.nodes.comfy.controlnet import PreprocessImage


class BinaryPreprocessor(PreprocessImage):
    bin_threshold: int = Field(
        default=100,
        description="The threshold for the binary image.",
        ge=0,
        le=255,
    )


class CannyEdgePreprocessor(PreprocessImage):
    low_threshold: int = Field(default=100, description="The low threshold to use.")
    high_threshold: int = Field(default=200, description="The high threshold to use.")


class LineartPreprocessor(PreprocessImage):
    coarse: EnableDisable = Field(
        default=EnableDisable.DISABLE,
        description="Whether to use coarse lineart.",
    )


class Manga2Anime_LineArt_Preprocessor(PreprocessImage):
    pass


class LineartStandardPreprocessor(PreprocessImage):
    guassian_sigma: float = Field(
        default=6.0, description="The Gaussian sigma value for preprocessing."
    )
    intensity_threshold: int = Field(
        default=8, description="The intensity threshold value for preprocessing."
    )


class PiDiNetPreprocessor(PreprocessImage):
    safe: EnableDisable = Field(
        default=EnableDisable.ENABLE,
    )


class AnimeLineArtPreprocessor(PreprocessImage):
    pass


class SafeMode(str, Enum):
    enable = "enable"
    disable = "disable"


class HEDPreprocessor(PreprocessImage):
    safe: SafeMode = Field(
        default=SafeMode.enable, description="Whether to use safe mode."
    )


class ScribblePreprocessor(PreprocessImage):
    pass


class ScribbleXDoGPreprocessor(PreprocessImage):
    threshold: float = Field(default=32, le=64, ge=1)


class AnyLinePreprocessor(PreprocessImage):
    _comfy_class: str = "AnyLineArtPreprocessor_aux"

    merge_with_lineart: str = Field(
        default="lineart_standard",
        description="The lineart to merge with.",
    )
    lineart_lower_bound: float = Field(
        default=0, description="The lower bound for lineart."
    )
    lineart_upper_bound: float = Field(
        default=1, description="The upper bound for lineart."
    )
    object_min_size: int = Field(
        default=36, description="The minimum size for objects."
    )
    object_connectivity: int = Field(
        default=1, description="The connectivity for objects."
    )


class DiffusionEdge_Preprocessor_Environment(str, Enum):
    INDOOR = "indoor"
    URBAN = "urban"
    NEUTRAL = "neutral"


class DiffusionEdge_Preprocessor(PreprocessImage):
    environment: DiffusionEdge_Preprocessor_Environment = Field(
        default=DiffusionEdge_Preprocessor_Environment.INDOOR,
        description="The environment to use.",
    )
    patch_batch_size: int = Field(
        default=4, description="The patch batch size to use.", ge=1, le=16
    )
