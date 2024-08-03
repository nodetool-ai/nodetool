from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

from nodetool.nodes.stable_diffusion.enums import Scheduler
from nodetool.nodes.stable_diffusion.enums import Sampler

class SD_ControlNet(GraphNode):
    model: CheckpointFile | GraphNode | tuple[GraphNode, str] = Field(default=CheckpointFile(type='comfy.checkpoint_file', name=''), description='Stable Diffusion checkpoint to load.')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to use.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The negative prompt to use.')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description=None)
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.0, description=None)
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=30, description=None)
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=768, description=None)
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=768, description=None)
    scheduler: Scheduler | GraphNode | tuple[GraphNode, str] = Field(default=Scheduler('exponential'), description=None)
    sampler: Sampler | GraphNode | tuple[GraphNode, str] = Field(default=Sampler('euler_ancestral'), description=None)
    input_image: ImageRef | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Input image for img2img (optional)')
    denoise: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)
    canny_image: ImageRef | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Canny edge detection image for ControlNet')
    depth_image: ImageRef | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Depth map image for ControlNet')
    canny_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Strength of Canny ControlNet')
    depth_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Strength of Depth ControlNet')
    @classmethod
    def get_node_type(cls): return "stable_diffusion.img2img.SD_ControlNet"


from nodetool.nodes.stable_diffusion.enums import Scheduler
from nodetool.nodes.stable_diffusion.enums import Sampler

class SD_Img2Img(GraphNode):
    model: CheckpointFile | GraphNode | tuple[GraphNode, str] = Field(default=CheckpointFile(type='comfy.checkpoint_file', name=''), description='Stable Diffusion checkpoint to load.')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to use.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The negative prompt to use.')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description=None)
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.0, description=None)
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=30, description=None)
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=768, description=None)
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=768, description=None)
    scheduler: Scheduler | GraphNode | tuple[GraphNode, str] = Field(default=Scheduler('exponential'), description=None)
    sampler: Sampler | GraphNode | tuple[GraphNode, str] = Field(default=Sampler('euler_ancestral'), description=None)
    input_image: ImageRef | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Input image for img2img (optional)')
    denoise: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)
    @classmethod
    def get_node_type(cls): return "stable_diffusion.img2img.SD_Img2Img"


