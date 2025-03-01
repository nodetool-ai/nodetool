import json
import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from nodetool.chat.tools import (
    ProcessNodeTool,
    Tool,
)
from nodetool.metadata.types import FunctionModel, Message, Provider
from nodetool.metadata.types import TextRef
from nodetool.chat.tools import (
    sanitize_node_name,
)
from nodetool.chat.chat import (
    process_messages,
)
from nodetool.models.user import User
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.models.thread import Thread

# load all nodes
import nodetool.nodes.nodetool

VALID_NODE_NAME = "some.valid.node.name"
INVALID_NODE_NAME = "invalid_node_name"
USER_ID = "12345"
THREAD_ID = "thread123"


class DummyNode(BaseNode):
    async def process(self, context: ProcessingContext) -> str:
        return "dummy"


def test_sanitize_node_name():
    assert sanitize_node_name(VALID_NODE_NAME) == "some__valid__node__name"


@pytest.mark.asyncio
async def test_process_message_valid(thread: Thread, context: ProcessingContext):
    pass


class MockFunction:
    def __init__(self, name, arguments):
        self.name = name
        self.arguments = arguments


class TestTool(Tool):
    value: str

    def __init__(self, value: str):
        super().__init__(name="TestTool", description="Test tool")
        self.value = value
        self.input_schema = {
            "type": "object",
            "properties": {
                "value": {
                    "type": "string",
                }
            },
        }

    async def process(self, context: ProcessingContext, params: dict) -> str:
        return self.value
