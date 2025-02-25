from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

import nodetool.nodes.apple.speech

class SayText(GraphNode):
    """
    Speak text using macOS's built-in text-to-speech
    speech, automation, macos, accessibility

    Use cases:
    - Add voice notifications to workflows
    - Create audio feedback
    - Accessibility features
    """

    MacOSVoice: typing.ClassVar[type] = nodetool.nodes.apple.speech.SayText.MacOSVoice
    text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Text to be spoken')
    rate: float | GraphNode | tuple[GraphNode, str] = Field(default=175.0, description='Speaking rate (words per minute)')
    volume: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Volume level (0.0 to 1.0)')
    voice: nodetool.nodes.apple.speech.SayText.MacOSVoice = Field(default=MacOSVoice.ALBERT, description='Voice identifier')

    @classmethod
    def get_node_type(cls): return "apple.speech.SayText"


