from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class CaptureScreen(GraphNode):
    """
    Capture screen content via PyObjC
    screen, automation, macos, media
    """

    whole_screen: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Capture the whole screen')
    x: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='X coordinate of the region to capture')
    y: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Y coordinate of the region to capture')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=1920, description='Width of the region to capture')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=1080, description='Height of the region to capture')

    @classmethod
    def get_node_type(cls): return "apple.screen.CaptureScreen"


