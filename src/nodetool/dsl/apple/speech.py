from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class SayText(GraphNode):
    """
    Speak text using macOS's built-in text-to-speech
    speech, automation, macos, accessibility

    Use cases:
    - Add voice notifications to workflows
    - Create audio feedback
    - Accessibility features
    """

    text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Text to be spoken')
    rate: int | GraphNode | tuple[GraphNode, str] = Field(default=175, description='Speaking rate (not implemented)')

    @classmethod
    def get_node_type(cls): return "apple.speech.SayText"


