from pydantic import BaseModel, Field
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode
from nodetool.common.replicate_node import ReplicateNode
from enum import Enum


class AudioSuperResolution(ReplicateNode):
    """AudioSR: Versatile Audio Super-resolution at Scale"""

    def replicate_model_id(self):
        return "nateraw/audio-super-resolution:9c3d3e39fb0cb6aea677264881d8073f835336137b39fdea4e94093319379535"

    def get_hardware(self):
        return "Nvidia A40 (Large) GPU"

    @classmethod
    def return_type(cls):
        return AudioRef

    seed: int | None = Field(
        title="Seed",
        description="Random seed. Leave blank to randomize the seed",
        default=None,
    )
    ddim_steps: int = Field(
        title="Ddim Steps",
        description="Number of inference steps",
        ge=10.0,
        le=500.0,
        default=50,
    )
    input_file: AudioRef = Field(default=AudioRef(), description="Audio to upsample")
    guidance_scale: float = Field(
        title="Guidance Scale",
        description="Scale for classifier free guidance",
        ge=1.0,
        le=20.0,
        default=3.5,
    )
