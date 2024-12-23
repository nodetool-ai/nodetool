from enum import Enum
from pydantic import Field
from nodetool.common.comfy_node import EnableDisable

from nodetool.nodes.comfy.controlnet import PreprocessImage
import comfy_custom_nodes.comfyui_controlnet_aux.node_wrappers.canny as canny
import comfy_custom_nodes.comfyui_controlnet_aux.node_wrappers.manga_line as manga_line
import comfy_custom_nodes.comfyui_controlnet_aux.node_wrappers.lineart_standard as lineart_standard
import comfy_custom_nodes.comfyui_controlnet_aux.node_wrappers.pidinet as pidinet
import comfy_custom_nodes.comfyui_controlnet_aux.node_wrappers.lineart_anime as lineart_anime
import comfy_custom_nodes.comfyui_controlnet_aux.node_wrappers.hed as hed
import comfy_custom_nodes.comfyui_controlnet_aux.node_wrappers.scribble as scribble
import comfy_custom_nodes.comfyui_controlnet_aux.node_wrappers.anyline as anyline
import comfy_custom_nodes.comfyui_controlnet_aux.node_wrappers.diffusion_edge as diffusion_edge


class BinaryPreprocessor(PreprocessImage):
    bin_threshold: int = Field(
        default=100,
        description="The threshold for the binary image.",
        ge=0,
        le=255,
    )


class CannyEdgePreprocessor(PreprocessImage):
    """
    Preprocesses an image for canny edge detection.
    """

    _comfy_class = canny.Canny_Edge_Preprocessor

    low_threshold: int = Field(default=100, description="The low threshold to use.")
    high_threshold: int = Field(default=200, description="The high threshold to use.")


class LineartPreprocessor(PreprocessImage):
    coarse: EnableDisable = Field(
        default=EnableDisable.DISABLE,
        description="Whether to use coarse lineart.",
    )


class Manga2Anime_LineArt_Preprocessor(PreprocessImage):
    """
    Preprocesses an image for manga to anime lineart.
    """

    _comfy_class = manga_line.Manga2Anime_LineArt_Preprocessor


class LineartStandardPreprocessor(PreprocessImage):
    """
    Preprocesses an image for standard lineart.
    """

    _comfy_class = lineart_standard.Lineart_Standard_Preprocessor

    guassian_sigma: float = Field(
        default=6.0, description="The Gaussian sigma value for preprocessing."
    )
    intensity_threshold: int = Field(
        default=8, description="The intensity threshold value for preprocessing."
    )


class PiDiNetPreprocessor(PreprocessImage):
    """
    Preprocesses an image for PiDiNet lineart.
    """

    _comfy_class = pidinet.PIDINET_Preprocessor

    safe: EnableDisable = Field(
        default=EnableDisable.ENABLE,
    )


class AnimeLineArtPreprocessor(PreprocessImage):
    """
    Preprocesses an image for anime lineart.
    """

    _comfy_class = lineart_anime.AnimeLineArt_Preprocessor


class SafeMode(str, Enum):
    enable = "enable"
    disable = "disable"


class HEDPreprocessor(PreprocessImage):
    """
    Preprocesses an image for HED lineart.
    """

    _comfy_class = hed.HED_Preprocessor

    safe: SafeMode = Field(
        default=SafeMode.enable, description="Whether to use safe mode."
    )


class ScribblePreprocessor(PreprocessImage):
    """
    Preprocesses an image for scribble lineart.
    """

    _comfy_class = scribble.Scribble_Preprocessor


class ScribbleXDoGPreprocessor(PreprocessImage):
    """
    Preprocesses an image for scribble lineart.
    """

    _comfy_class = scribble.Scribble_XDoG_Preprocessor

    threshold: float = Field(default=32, le=64, ge=1)


class AnyLinePreprocessor(PreprocessImage):
    """
    Preprocesses an image for any lineart.
    """

    _comfy_class = anyline.AnyLinePreprocessor

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
    """
    Preprocesses an image for diffusion edge detection.
    """

    _comfy_class = diffusion_edge.DiffusionEdge_Preprocessor

    environment: DiffusionEdge_Preprocessor_Environment = Field(
        default=DiffusionEdge_Preprocessor_Environment.INDOOR,
        description="The environment to use.",
    )
    patch_batch_size: int = Field(
        default=4, description="The patch batch size to use.", ge=1, le=16
    )
