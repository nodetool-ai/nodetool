from nodetool.common.comfy_node import ComfyNode
from nodetool.metadata.types import Conditioning, CLIP
from pydantic import Field


class CLIPTextEncodeSDXLSimplified(ComfyNode):
    """
    Encode text for SDXL models with simplified parameters.
    text, encoding, SDXL

    Use cases:
    - Generate SDXL-compatible text embeddings
    - Prepare text inputs for SDXL image generation
    - Customize text encoding for SDXL workflows
    """

    width: int = Field(
        default=1024, ge=0, le=8192, description="Width of the target image."
    )
    height: int = Field(
        default=1024, ge=0, le=8192, description="Height of the target image."
    )
    size_cond_factor: int = Field(
        default=4, ge=1, le=16, description="Size conditioning factor."
    )
    text: str = Field(default="", description="Input text to encode.")
    clip: CLIP = Field(default=CLIP(), description="CLIP model to use for encoding.")

    @classmethod
    def return_type(cls):
        return {"conditioning": Conditioning}


class ConditioningCombineMultiple(ComfyNode):
    """
    Combine multiple conditioning inputs.
    conditioning, combine, merge

    Use cases:
    - Merge different text embeddings
    - Combine various conditioning signals
    - Create complex conditioning for advanced image generation
    """

    conditioning_1: Conditioning = Field(
        default=Conditioning(), description="First conditioning input."
    )
    conditioning_2: Conditioning = Field(
        default=Conditioning(), description="Second conditioning input."
    )
    conditioning_3: Conditioning = Field(
        default=None, description="Optional third conditioning input."
    )
    conditioning_4: Conditioning = Field(
        default=None, description="Optional fourth conditioning input."
    )
    conditioning_5: Conditioning = Field(
        default=None, description="Optional fifth conditioning input."
    )

    @classmethod
    def return_type(cls):
        return {"conditioning": Conditioning}


class SD3NegativeConditioning(ComfyNode):
    """
    Generate negative conditioning for Stable Diffusion 3 models.
    conditioning, negative, SD3

    Use cases:
    - Create negative prompts for SD3
    - Fine-tune image generation by specifying what not to include
    - Implement advanced prompt engineering techniques for SD3
    """

    conditioning: Conditioning = Field(
        default=Conditioning(), description="Input conditioning to modify."
    )
    end: float = Field(
        default=0.1, ge=0.0, le=1.0, description="End point for negative conditioning."
    )

    @classmethod
    def return_type(cls):
        return {"conditioning": Conditioning}
