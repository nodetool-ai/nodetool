from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class ExtractVideoFrames(GraphNode):
    video: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='The input video to adjust the brightness for.')
    start: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The frame to start extracting from.')
    end: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The frame to stop extracting from.')
    @classmethod
    def get_node_type(cls): return "nodetool.video.ExtractVideoFrames"



class FramesToVideo(GraphNode):
    frames: list[ImageRef] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    fps: float | GraphNode | tuple[GraphNode, str] = Field(default=30, description='The FPS of the output video.')
    @classmethod
    def get_node_type(cls): return "nodetool.video.FramesToVideo"



class SaveVideo(GraphNode):
    value: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=VideoRef(type='video', uri='', asset_id=None, duration=None, format=None), description=None)
    folder: FolderRef | GraphNode | tuple[GraphNode, str] = Field(default=FolderRef(type='folder', uri='', asset_id=None), description='Name of the output folder.')
    name: str | GraphNode | tuple[GraphNode, str] = Field(default='video', description='Name of the output video.')
    @classmethod
    def get_node_type(cls): return "nodetool.video.SaveVideo"



class VideoFps(GraphNode):
    video: VideoRef | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='The input video to adjust the brightness for.')
    @classmethod
    def get_node_type(cls): return "nodetool.video.VideoFps"


