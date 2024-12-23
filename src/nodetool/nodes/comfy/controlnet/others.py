from pydantic import Field
from nodetool.nodes.comfy.controlnet import PreprocessImage
import comfy_custom_nodes.comfyui_controlnet_aux.node_wrappers.tile as tile
import comfy_custom_nodes.comfyui_controlnet_aux.node_wrappers.recolor as recolor


class TilePreprocessor(PreprocessImage):
    """
    Tile preprocessor.
    """

    _comfy_class = tile.Tile_Preprocessor

    pyrUp_iters: int = Field(
        default=3,
        description="The number of times to apply pyrUp.",
        ge=1,
        le=10,
    )


class ImageLuminanceDetector(PreprocessImage):
    """
    Detect the luminance of an image.
    """

    _comfy_class = recolor.ImageLuminanceDetector

    gamma_correction: float = Field(
        default=1.0,
        description="The gamma correction value.",
        ge=0.1,
        le=2.0,
    )

    @classmethod
    def get_title(cls):
        return "Image Luminance"


class ImageIntensityDetector(PreprocessImage):
    """
    Detect the intensity of an image.
    """

    _comfy_class = recolor.ImageIntensityDetector

    gamma_correction: float = Field(
        default=1.0,
        description="The gamma correction value.",
        ge=0.1,
        le=2.0,
    )

    @classmethod
    def get_title(cls):
        return "Image Intensity"
