import json
import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from nodetool.metadata.types import Message
from nodetool.metadata.types import TextRef
from nodetool.common.chat import (
    process_node_function,
    sanitize_node_name,
    desanitize_node_name,
    function_tool_from_node,
    process_workflow_function,
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

    context = ProcessingContext(user_id=USER_ID, auth_token="")
    result = await process_node_function(context, DummyNode.get_node_type(), {})
    assert result == {"output": "dummy"}


@pytest.mark.asyncio
async def test_process_node_function_invalid():
    context = ProcessingContext(user_id=USER_ID, auth_token="")
    with pytest.raises(ValueError):
        await process_workflow_function(context, INVALID_NODE_NAME, {})


@pytest.mark.asyncio
async def test_process_message_valid(thread: Thread, context: ProcessingContext):
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


class MockFunction:
    def __init__(self, name, arguments):
        self.name = name
        self.arguments = arguments


@pytest.mark.asyncio
async def test_process_message_with_tool_call(
    thread: Thread, context: ProcessingContext
):
    with patch(
        "nodetool.common.chat.Environment.get_openai_client"
    ) as get_openai_client_mock:
        tool_call = MagicMock(
            function=MockFunction(
                name="node__nodetool_constant_String",
                arguments=json.dumps({"value": "Text"}),
            ),
            id="tool_call_id",
        )
        response_message = MagicMock(tool_calls=[tool_call], content="Hello world")
        completion = AsyncMock(choices=[MagicMock(message=response_message)])
        get_openai_client_mock.return_value = MagicMock(
            chat=MagicMock(
                completions=MagicMock(create=AsyncMock(return_value=completion))
            )
        )
        messages = [
            Message(
                role="user",
                content="Hello",
            )
        ]
        model = MagicMock(name="gpt")
        res = await process_messages(
            model=model,
            context=context,
            thread_id=thread.id,
            messages=messages,
            node_types=["nodetool.constant.Text"],
        )
        assert len(res.tasks) == 0
        assert len(res.tool_calls) == 1
        assert res.tool_calls[0].function_name == "node__nodetool_constant_String"
        assert res.tool_calls[0].function_args == {"value": "Text"}
        assert res.tool_calls[0].function_response, "Text"


@pytest.mark.asyncio
async def test_process_message_with_task_creation(
    thread: Thread, context: ProcessingContext
):
    with patch(
        "nodetool.common.chat.Environment.get_openai_client"
    ) as get_openai_client_mock:
        task_call = MagicMock(
            function=MockFunction(
                name="create_task",
                arguments=json.dumps(
                    {
                        "task_type": "generate_text",
                        "name": "Generate a summary",
                        "instructions": "Generate a summary of the given text.",
                        "dependencies": ["tool_call_id"],
                    }
                ),
            ),
            id="task_call_id",
        )
        response_message = MagicMock(tool_calls=[task_call], content="Hello world")
        completion = AsyncMock(choices=[MagicMock(message=response_message)])
        get_openai_client_mock.return_value = MagicMock(
            chat=MagicMock(
                completions=MagicMock(create=AsyncMock(return_value=completion))
            )
        )
        messages = [
            Message(
                role="user",
                content="Hello",
            )
        ]
        model = MagicMock(name="gpt")
        res = await process_messages(
            model=model,
            context=context,
            thread_id=thread.id,
            messages=messages,
            node_types=["nodetool.constant.Text"],
            can_create_tasks=True,
        )
        assert len(res.tasks) == 1
        assert res.tasks[0].task_type == "generate_text"
        assert res.tasks[0].name == "Generate a summary"
        assert res.tasks[0].instructions == "Generate a summary of the given text."
