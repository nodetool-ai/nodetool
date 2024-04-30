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
    def model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/132630f1-18c6-429e-bc5b-214775997065/video_llava.png",
            "created_at": "2023-11-20T21:16:55.794627Z",
            "description": "Video-LLaVA: Learning United Visual Representation by Alignment Before Projection",
            "github_url": "https://github.com/PKU-YuanGroup/Video-LLaVA",
            "license_url": "https://github.com/PKU-YuanGroup/Video-LLaVA#-license",
            "name": "video-llava",
            "owner": "nateraw",
            "paper_url": "https://arxiv.org/abs/2311.10122",
            "run_count": 280571,
            "url": "https://replicate.com/nateraw/video-llava",
            "visibility": "public",
            "hardware": "Nvidia A40 (Large) GPU",
        }

    @classmethod
    def return_type(cls):
        return str

    image_path: ImageRef = Field(default=ImageRef(), description="Path to image file.")
    video_path: VideoRef = Field(default=VideoRef(), description="Path to video file.")
    text_prompt: str | None = Field(title="Text Prompt", default=None)
