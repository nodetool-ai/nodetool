from pydantic import Field
from nodetool.nodes.comfy.controlnet import PreprocessImage


class TilePreprocessor(PreprocessImage):
    pyrUp_iters: int = Field(
        default=3,
        description="The number of times to apply pyrUp.",
        ge=1,
        le=10,
    )


class SAMPreprocessor(PreprocessImage):
    pass
