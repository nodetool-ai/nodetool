from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class AudioSuperResolution(GraphNode):
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Random seed. Leave blank to randomize the seed')
    ddim_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='Number of inference steps')
    input_file: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None), description='Audio to upsample')
    guidance_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=3.5, description='Scale for classifier free guidance')
    @classmethod
    def get_node_type(cls): return "replicate.audio.enhance.AudioSuperResolution"


