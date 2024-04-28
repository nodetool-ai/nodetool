from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

from nodetool.nodes.huggingface.image.generate import ModelId
from nodetool.nodes.huggingface.image.generate import Scheduler

class StableDiffusionXL(GraphNode):
    model: ModelId | GraphNode | tuple[GraphNode, str] = Field(default=ModelId('stabilityai/stable-diffusion-xl-base-1.0'), description='The model ID to use for the image generation')
    inputs: str | GraphNode | tuple[GraphNode, str] = Field(default='A photo of a cat.', description='The input text to the model')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The negative prompt to use.')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description=None)
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=7.0, description=None)
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=30, description=None)
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=768, description=None)
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=768, description=None)
    scheduler: Scheduler | GraphNode | tuple[GraphNode, str] = Field(default=Scheduler('EulerDiscreteScheduler'), description=None)
    @classmethod
    def get_node_type(cls): return "huggingface.image.generate.StableDiffusionXL"


