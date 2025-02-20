from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class BasicGuider(GraphNode):
    """
    The Basic Guider node provides a simple guidance mechanism for the sampling process. It uses a single conditioning input to guide the model's generation.
    sampling, guidance, basic
    Use cases:
    - Simple guidance for image generation
    - Single conditioning input scenarios
    - Basic control over the sampling process
    """

    model: UNet | GraphNode | tuple[GraphNode, str] = Field(default=UNet(type='comfy.unet', name='', model=None), description='The model used by the sampler.')
    conditioning: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning', data=None), description='The conditioning.')

    @classmethod
    def get_node_type(cls): return "comfy.sampling.guiders.BasicGuider"



class CFGGuider(GraphNode):
    """
    The CFG (Classifier-Free Guidance) Guider node implements the classifier-free guidance method for controlling the generation process. It allows for separate positive and negative conditioning, along with a CFG scale parameter.
    sampling, guidance, cfg
    Use cases:
    - Advanced control over the sampling process
    - Combining multiple conditioning inputs
    - Creating diverse image variations
    """

    model: UNet | GraphNode | tuple[GraphNode, str] = Field(default=UNet(type='comfy.unet', name='', model=None), description='The model used by the sampler.')
    positive: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The positive conditioning.')
    negative: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The negative conditioning.')
    cfg: float | GraphNode | tuple[GraphNode, str] = Field(default=8.0, description='The cfg (classifier-free guidance) parameter.')

    @classmethod
    def get_node_type(cls): return "comfy.sampling.guiders.CFGGuider"



class DualCFGGuider(GraphNode):
    """
    The Dual CFG Guider node extends the CFG guidance method by allowing two separate conditioning inputs, each with its own CFG scale. This can be useful for more complex guidance scenarios or when combining multiple concepts.
    sampling, guidance, cfg, dual
    Use cases:
    - Advanced control over the sampling process
    - Combining multiple conditioning inputs
    - Creating diverse image variations
    """

    model: UNet | GraphNode | tuple[GraphNode, str] = Field(default=UNet(type='comfy.unet', name='', model=None), description='The model used by the sampler.')
    cond1: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning', data=None), description='The first conditioning.')
    cond2: Conditioning | GraphNode | tuple[GraphNode, str] = Field(default=Conditioning(type='comfy.conditioning', data=None), description='The second conditioning.')
    negative: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The negative conditioning.')
    cfg_conds: float | GraphNode | tuple[GraphNode, str] = Field(default=8.0, description='The cfg (classifier-free guidance) parameter.')
    cfg_conds2_negative: float | GraphNode | tuple[GraphNode, str] = Field(default=8.0, description='The cfg (classifier-free guidance) parameter for the second conditioning.')

    @classmethod
    def get_node_type(cls): return "comfy.sampling.guiders.DualCFGGuider"



class VideoLinearCFGGuidance(GraphNode):
    """
    The Video Linear CFG Guidance node applies a linear CFG guidance scheme specifically designed for video generation tasks. It allows setting a minimum CFG value to control the strength of the guidance throughout the video frames.
    sampling, guidance, cfg, video
    Use cases:
    - Creating consistent video outputs
    - Controlling the strength of guidance across frames
    - Enhancing video generation with CFG
    """

    model: UNet | GraphNode | tuple[GraphNode, str] = Field(default=UNet(type='comfy.unet', name='', model=None), description='The model to apply guidance to.')
    min_cfg: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The minimum CFG value.')

    @classmethod
    def get_node_type(cls): return "comfy.sampling.guiders.VideoLinearCFGGuidance"



class VideoTriangleCFGGuidance(GraphNode):
    """
    The Video Triangle CFG Guidance node applies a triangular CFG guidance scheme for video generation. This can create a varying strength of guidance across video frames, potentially leading to more dynamic or consistent video outputs.
    sampling, guidance, cfg, video
    Use cases:
    - Creating dynamic video outputs
    - Controlling the strength of guidance across frames
    - Enhancing video generation with CFG
    """

    model: UNet | GraphNode | tuple[GraphNode, str] = Field(default=UNet(type='comfy.unet', name='', model=None), description='The model to apply guidance to.')
    min_cfg: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The minimum CFG value.')

    @classmethod
    def get_node_type(cls): return "comfy.sampling.guiders.VideoTriangleCFGGuidance"


