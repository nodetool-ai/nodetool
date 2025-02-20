from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class VideoLlava(GraphNode):
    """Video-LLaVA: Learning United Visual Representation by Alignment Before Projection"""

    image_path: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='Path to image file.')
    video_path: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, data=None, duration=None, format=None), description='Path to video file.')
    text_prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description=None)

    @classmethod
    def get_node_type(cls): return "replicate.video.analyze.VideoLlava"


