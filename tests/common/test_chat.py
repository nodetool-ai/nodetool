import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from nodetool.metadata.types import TextRef
from nodetool.common.chat import (
    process_node_function,
    sanitize_node_name,
    desanitize_node_name,
    function_tool_from_node,
    process_workflow_function,
    process_messages,
)
from nodetool.models.message import Message
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.models.thread import Thread

# load all nodes
import nodetool.nodes

VALID_NODE_NAME = "some.valid.node.name"
INVALID_NODE_NAME = "invalid_node_name"
USER_ID = "12345"
THREAD_ID = "thread123"


def test_sanitize_node_name():
    assert sanitize_node_name(VALID_NODE_NAME) == "some_valid_node_name"


def test_desanitize_node_name():
    assert desanitize_node_name("some_valid_node_name") == "some.valid.node.name"


def test_function_tool_from_node_valid():
    result = function_tool_from_node("nodetool.constant.Text")
    assert "parameters" in result["function"]
    assert result["function"]["parameters"] == {
        "type": "object",
        "properties": {
            "value": {
                "description": None,
                "properties": {"url": {"type": "string"}},
                "type": "object",
            }
        },
    }


def test_function_tool_from_node_invalid():
    with pytest.raises(ValueError):
        function_tool_from_node("unknown.node.name")


@pytest.mark.asyncio
async def test_process_node_function_valid():
    import nodetool.nodes

    context = ProcessingContext(user_id=USER_ID)
    result = await process_node_function(context, "nodetool.constant.Text", {})
    assert result == {"output": TextRef(uri="", type="text")}


@pytest.mark.asyncio
async def test_process_node_function_invalid():
    context = ProcessingContext(user_id=USER_ID)
    with pytest.raises(ValueError):
        await process_workflow_function(context, INVALID_NODE_NAME, {})


@pytest.mark.asyncio
async def test_process_message_valid():
    thread = Thread.create(user_id=USER_ID)
    context = ProcessingContext(user_id=USER_ID)
    with patch(
        "nodetool.common.chat.Environment.get_openai_client"
    ) as get_openai_client_mock:
        response_message = MagicMock(tool_calls=None, content="Hello world")
        completion = AsyncMock(choices=[MagicMock(message=response_message)])
        get_openai_client_mock.return_value = MagicMock(
            chat=MagicMock(
                completions=MagicMock(create=AsyncMock(return_value=completion))
            )
        )
        messages = [
            Message(
                id="1",
                role="user",
                content="Hello",
            )
        ]
        model = MagicMock(name="gpt")
        result = await process_messages(
            model=model,
            context=context,
            thread_id=thread.id,
            messages=messages,
        )
        assert result is not None
