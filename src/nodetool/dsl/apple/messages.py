from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class SendMessage(GraphNode):
    """
    Send messages using macOS Messages.app via AppleScript
    messages, imessage, automation, macos, communication

    Use cases:
    - Send automated notifications via iMessage
    - Integrate messaging into workflows
    - Send workflow results to yourself or others
    """

    recipient: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Phone number, email, or contact name to send message to')
    text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Message content to send')

    @classmethod
    def get_node_type(cls): return "apple.messages.SendMessage"


