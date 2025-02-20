from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class DisplayImage(GraphNode):
    """
    Display an image in a window.
    gui, image, display

    Use cases:
    - Preview image processing results
    - Show generated images
    - Display image transformations
    """

    title: str | GraphNode | tuple[GraphNode, str] = Field(default='Display Window', description='Window title')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=400, description='Window width')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=300, description='Window height')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Image to display')

    @classmethod
    def get_node_type(cls): return "lib.ui.tk.DisplayImage"



class DisplayText(GraphNode):
    """
    Display text in a scrollable window.
    gui, text, display

    Use cases:
    - Show processing results
    - Display log messages
    - Preview text content
    """

    title: str | GraphNode | tuple[GraphNode, str] = Field(default='Display Window', description='Window title')
    width: int | GraphNode | tuple[GraphNode, str] = Field(default=400, description='Window width')
    height: int | GraphNode | tuple[GraphNode, str] = Field(default=300, description='Window height')
    text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Text content to display')
    font: str | GraphNode | tuple[GraphNode, str] = Field(default='Arial 12', description='Text font and size')

    @classmethod
    def get_node_type(cls): return "lib.ui.tk.DisplayText"


