from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

from nodetool.nodes.stable_diffusion.enums import Scheduler
from nodetool.nodes.stable_diffusion.enums import Sampler

class SD_Txt2Img(GraphNode):
    model: CheckpointFile | GraphNode | tuple[GraphNode, str] = Field(default=CheckpointFile(type='comfy.checkpoint_file', name=''), description='Stable Diffusion checkpoint to load.')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The prompt to use.')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The negative prompt to use.')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description=None)
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.0, description=None)
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=30, description='Number of inference steps.')
    num_hires_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Number of high resolution steps. If 0, no high resolution steps are taken.')
    hires_denoise: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Denoising strength for high resolution steps.')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description=None)
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=512, description=None)
    scheduler: Scheduler | GraphNode | tuple[GraphNode, str] = Field(default=Scheduler('exponential'), description=None)
    sampler: Sampler | GraphNode | tuple[GraphNode, str] = Field(default=Sampler('euler_ancestral'), description=None)
    @classmethod
    def get_node_type(cls): return "stable_diffusion.txt2img.SD_Txt2Img"


