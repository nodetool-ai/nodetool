from pydantic import Field
from nodetool.nodes.comfy.controlnet import PreprocessImage


class TilePreprocessor(PreprocessImage):
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
    gamma_correction: float = Field(
        default=1.0,
        description="The gamma correction value.",
        ge=0.1,
        le=2.0,
    )

    @classmethod
    def get_title(cls):
        return "Image Intensity"
