from pydantic import Field
from nodetool.common.comfy_node import ComfyNode
from nodetool.metadata.types import Conditioning, Guider, UNet


class BasicGuider(ComfyNode):
    """
    The Basic Guider node provides a simple guidance mechanism for the sampling process.
    It uses a single conditioning input to guide the model's generation.
    """

    model: UNet = Field(default=UNet(), description="The model used by the sampler.")
    conditioning: Conditioning = Field(
        default=Conditioning(), description="The conditioning."
    )

    @classmethod
    def return_type(cls):
        return {"guider": Guider}


class CFGGuider(ComfyNode):
    """
    The CFG (Classifier-Free Guidance) Guider node implements the classifier-free guidance
    method for controlling the generation process. It allows for separate positive and
    negative conditioning, along with a CFG scale parameter.
    """

    model: UNet = Field(default=UNet(), description="The model used by the sampler.")
    positive: str = Field(default="", description="The positive conditioning.")
    negative: str = Field(default="", description="The negative conditioning.")
    cfg: float = Field(
        default=8.0, description="The cfg (classifier-free guidance) parameter."
    )

    @classmethod
    def return_type(cls):
        return {"guider": Guider}


class DualCFGGuider(ComfyNode):
    """
    The Dual CFG Guider node extends the CFG guidance method by allowing two separate
    conditioning inputs, each with its own CFG scale. This can be useful for more
    complex guidance scenarios or when combining multiple concepts.
    """

    model: UNet = Field(default=UNet(), description="The model used by the sampler.")
    cond1: Conditioning = Field(
        default=Conditioning(), description="The first conditioning."
    )
    cond2: Conditioning = Field(
        default=Conditioning(), description="The second conditioning."
    )
    negative: str = Field(default="", description="The negative conditioning.")
    cfg_conds: float = Field(
        default=8.0, description="The cfg (classifier-free guidance) parameter."
    )
    cfg_conds2_negative: float = Field(
        default=8.0,
        description="The cfg (classifier-free guidance) parameter for the second conditioning.",
    )

    @classmethod
    def return_type(cls):
        return {"guider": Guider}


class VideoLinearCFGGuidance(ComfyNode):
    """
    The Video Linear CFG Guidance node applies a linear CFG guidance scheme specifically
    designed for video generation tasks. It allows setting a minimum CFG value to control
    the strength of the guidance throughout the video frames.
    """

    model: UNet = Field(default=UNet(), description="The model to apply guidance to.")
    min_cfg: float = Field(
        default=1.0, description="The minimum CFG value.", ge=0.0, le=100.0
    )

    @classmethod
    def return_type(cls):
        return {"model": UNet}


class VideoTriangleCFGGuidance(ComfyNode):
    """
    The Video Triangle CFG Guidance node applies a triangular CFG guidance scheme for
    video generation. This can create a varying strength of guidance across video frames,
    potentially leading to more dynamic or consistent video outputs.
    """

    model: UNet = Field(default=UNet(), description="The model to apply guidance to.")
    min_cfg: float = Field(
        default=1.0, description="The minimum CFG value.", ge=0.0, le=100.0
    )

    @classmethod
    def return_type(cls):
        return {"model": UNet}
