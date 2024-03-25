from pydantic import Field
from nodetool.nodes.comfy.controlnet import PreprocessImage


class AnimeFace_SemSegPreprocessor(PreprocessImage):
    remove_background_using_abgr: bool = Field(
        default=True,
        description="Whether to remove the background.",
    )
    resolution: int = Field(
        default=512, description="The width of the image to generate.", ge=512, le=512
    )


class OneFormerCOCOSemSegPreprocessor(PreprocessImage):
    pass


class OneFormer_ADE20K_SemSegPreprocessor(PreprocessImage):
    pass


class UniformerSemSegPreprocessor(PreprocessImage):
    pass
