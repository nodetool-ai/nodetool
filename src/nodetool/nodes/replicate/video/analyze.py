from pydantic import BaseModel, Field
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode
from nodetool.common.replicate_node import ReplicateNode
from enum import Enum


class VideoLlava(ReplicateNode):
    """Video-LLaVA: Learning United Visual Representation by Alignment Before Projection"""

    def replicate_model_id(self):
        return "nateraw/video-llava:26387f81b9417278a8578188a31cd763eb3a55ca0f3ec375bf69c713de3fb4e8"

    def get_hardware(self):
        return "Nvidia A40 (Large) GPU"

    @classmethod
    def return_type(cls):
        return str

    image_path: ImageRef = Field(default=ImageRef(), description="Path to image file.")
    video_path: VideoRef = Field(default=VideoRef(), description="Path to video file.")
    text_prompt: str | None = Field(title="Text Prompt", default=None)
