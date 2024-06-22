import asyncio
from datetime import datetime
import json
from typing import Any, Sequence

from pydantic import BaseModel
from anthropic.types.message_param import MessageParam
from anthropic.types.text_block import TextBlock
from anthropic.types.tool_use_block import ToolUseBlock
from nodetool.chat.tools import Tool
from nodetool.common.environment import Environment
from openai.types.chat import (
    ChatCompletionMessageParam as OpenAIChatCompletionMessageParam,
    ChatCompletionToolMessageParam as OpenAIChatCompletionToolMessageParam,
    ChatCompletionSystemMessageParam as OpenAIChatCompletionSystemMessageParam,
    ChatCompletionUserMessageParam as OpenAIChatCompletionUserMessageParam,
    ChatCompletionAssistantMessageParam as OpenAIChatCompletionAssistantMessageParam,
    ChatCompletionMessageToolCallParam as OpenAIChatCompletionMessageToolCallParam,
    ChatCompletionContentPartParam as OpenAIChatCompletionContentPartParam,
)
from openai.types.chat.chat_completion_message_tool_call_param import (
    Function as OpenAIFunction,
)
from nodetool.metadata.types import (
    ChatCompletionAssistantMessageParam,
    ChatCompletionMessageParam,
    ChatCompletionMessageToolCall,
    ChatCompletionSystemMessageParam,
    ChatCompletionToolMessageParam,
    ChatCompletionUserMessageParam,
    ColumnDef,
    Function,
    FunctionModel,
    Message,
    ToolCall,
)
from nodetool.models.message import (
    MessageContent,
    MessageImageContent,
    MessageTextContent,
)
from nodetool.models.prediction import Prediction
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.api.types.chat import MessageCreateRequest, TaskCreateRequest


def json_schema_for_column(column: ColumnDef) -> dict:
    """
    Create a JSON schema for a column.

    Args:
        column (ColumnDef): The column definition.

    Returns:
        dict: The JSON schema for the column.
    """
    data_type = column.data_type
    description = column.description or "Required field for the record."

    if data_type == "string":
        return {"type": "string", "description": description}
    if data_type == "number":
        return {"type": "number", "description": description}
    if data_type == "int":
        return {"type": "integer", "description": description}
    if data_type == "datetime":
        return {"type": "string", "format": "date-time", "description": description}
    raise ValueError(f"Unknown data type {data_type}")


def default_serializer(obj: Any) -> dict:
    if isinstance(obj, BaseModel):
        return obj.model_dump()
    raise TypeError("Type not serializable")


def message_content_to_openai_content_part(
    content: MessageContent,
) -> OpenAIChatCompletionContentPartParam:
    """
    Convert a message content to an OpenAI content part.

    Args:
        content (MessageContent): The message content to convert.

    Returns:
        OpenAIChatCompletionContentPartParam: The OpenAI content part.
    """
    if isinstance(content, MessageTextContent):
        return {"type": "text", "text": content.text}
    elif isinstance(content, MessageImageContent):
        return {"type": "image_url", "image_url": {"url": content.image_url.url}}
    else:
        raise ValueError(f"Unknown content type {content}")


def convert_to_openai_message(
    message: ChatCompletionMessageParam,
) -> OpenAIChatCompletionMessageParam:
    """
    Convert a message to an OpenAI message.

    Args:
        message (ChatCompletionMessageParam): The message to convert.

    Returns:
        dict: The OpenAI message.
    """
    if isinstance(message, ChatCompletionToolMessageParam):
        if isinstance(message.content, BaseModel):
            content = message.content.model_dump_json()
        else:
            content = json.dumps(message.content)
        return OpenAIChatCompletionToolMessageParam(
            role=message.role,
            content=content,
            tool_call_id=message.tool_call_id,
        )
    elif isinstance(message, ChatCompletionSystemMessageParam):
        return OpenAIChatCompletionSystemMessageParam(
            role=message.role, content=message.content
        )
    elif isinstance(message, ChatCompletionUserMessageParam):
        assert message.content is not None, "User message content must not be None"
        if isinstance(message.content, str):
            content = message.content
        else:
            content = [
                message_content_to_openai_content_part(c) for c in message.content
            ]

        return OpenAIChatCompletionUserMessageParam(role=message.role, content=content)
    elif isinstance(message, ChatCompletionAssistantMessageParam):
        assert message.tool_calls is not None, "Tool calls must not be None"
        tool_calls = [
            OpenAIChatCompletionMessageToolCallParam(
                type="function",
                id=tool_call.id,
                function=OpenAIFunction(
                    name=tool_call.function_name,
                    arguments=json.dumps(tool_call.function_args),
                ),
            )
            for tool_call in message.tool_calls
        ]
        return OpenAIChatCompletionAssistantMessageParam(
            role=message.role, content=message.content, tool_calls=tool_calls
        )
    else:
        raise ValueError(f"Unknown message type {message}")


async def create_openai_completion(
    model: FunctionModel,
    messages: Sequence[ChatCompletionMessageParam],
    tools: Sequence[Tool] = [],
    **kwargs,
) -> Message:
    """
    Creates an OpenAI completion using the provided messages.

    Args:
        model (FunctionModel): The model to use for the completion.
        messages (list[ChatCompletionMessageParam]): Entire conversation history.
        tools (list[ChatCompletionToolParam]): A list of tools to be used by the model.
        **kwargs: Additional keyword arguments passed to openai API.

    Returns:
        Message: The message returned by the OpenAI API.
    """

    client = Environment.get_openai_client()
    kwargs = {}

    if len(tools) > 0:
        kwargs["tools"] = [tool.tool_param() for tool in tools]

    openai_messages = [convert_to_openai_message(m) for m in messages]

    completion = await client.chat.completions.create(
        model=model.name,
        messages=openai_messages,
        **kwargs,
    )  # type: ignore
    response_message = completion.choices[0].message
    tool_calls = []

    if response_message.tool_calls:
        for tool_call in response_message.tool_calls:
            tool_calls.append(
                ToolCall(
                    id=tool_call.id,
                    function_name=tool_call.function.name,
                    function_args=json.loads(tool_call.function.arguments),
                )
            )

    return Message(
        role="assistant", content=response_message.content, tool_calls=tool_calls
    )


async def create_anthropic_completion(
    model: FunctionModel,
    messages: Sequence[ChatCompletionMessageParam],
    tools: Sequence[Tool] = [],
    **kwargs,
) -> Message:
    """
    Creates an anthropic completion by sending messages to the anthropic client.

    Args:
        model (FunctionModel): The model to use for generating the completion.
        messages (list[ChatCompletionMessageParam]): Entire conversation history.
        tools (list[Tool], optional): The list of tools to use. Defaults to [].
        **kwargs: Additional keyword arguments passed to the anthropic client.

    Returns:
        Message: The message returned by the anthropic client.

    Raises:
        ValueError: If no completion content is returned.
    """

    client = Environment.get_anthropic_client()

    def convert_message(message: ChatCompletionMessageParam) -> MessageParam:
        if isinstance(message, ChatCompletionToolMessageParam):
            return {
                "role": "tool",
                "content": {
                    "type": "tool_result",
                    "tool_use_id": message.tool_call_id,
                    "content": [{"type": "text", "text": str(message.content)}],
                    "is_error": False,
                },  # type: ignore
            }
        else:
            return {"role": message.role, "content": message.content}  # type: ignore

    def convert_tool(tool: Tool) -> dict:
        return {
            "name": tool.name,
            "description": tool.description,
            "input_schema": tool.input_schema,
        }

    system_messages = [
        message
        for message in messages
        if isinstance(message, ChatCompletionSystemMessageParam)
    ]
    messages = [
        message
        for message in messages
        if not isinstance(message, ChatCompletionSystemMessageParam)
    ]

    completion = await client.messages.create(
        system=system_messages[0].content if len(system_messages) > 0 else "",
        messages=[convert_message(message) for message in messages],
        model=model.name,
        tools=[convert_tool(tool) for tool in tools],  # type: ignore
        **kwargs,
    )
    if len(completion.content) == 0:
        raise ValueError("No completion content returned")

    message = None
    tool_calls = []

    for content in completion.content:
        if isinstance(content, TextBlock):
            message = Message(role="assistant", content=content.text)
        elif isinstance(content, ToolUseBlock):
            tool_calls.append(
                ToolCall(
                    id=content.id,
                    function_name=content.name,
                    function_args=dict(content.input),  # type: ignore
                )
            )

    assert message is not None, "No completion content returned"

    message.tool_calls = tool_calls

    return message


async def create_completion(
    context: ProcessingContext,
    model: FunctionModel,
    messages: Sequence[ChatCompletionMessageParam],
    tools: Sequence[Tool],
    **kwargs,
) -> Message:
    print(f"Creating completion with model {model.name}")

    if model.name.startswith("gpt"):
        return await create_openai_completion(model, messages, tools, **kwargs)
    elif model.name.startswith("claude"):
        return await create_anthropic_completion(model, messages, tools, **kwargs)
    else:
        raise ValueError(f"Unknown model type {model.name}")


def message_param(message: Message) -> ChatCompletionMessageParam:
    """
    Converts a given message object to the corresponding ChatCompletionMessageParam object based on the message role.

    Args:
        message (Message): The message object to convert.

    Returns:
        ChatCompletionMessageParam: The converted ChatCompletionMessageParam object.

    Raises:
        ValueError: If the message role is unknown.
        AssertionError: If the message content or tool call ID is not of the expected type.
    """

    if message.role == "assistant":
        assert (
            isinstance(message.content, str) or message.content is None
        ), "Assistant message content must be a string or None"
        return ChatCompletionAssistantMessageParam(
            role="assistant", content=message.content, tool_calls=message.tool_calls
        )
    elif message.role == "tool":
        assert message.tool_call_id is not None, "Tool message must have a tool call ID"
        assert isinstance(message.content, str), "Tool message content must be a string"
        return ChatCompletionToolMessageParam(
            role="tool",
            tool_call_id=message.tool_call_id,
            content=message.content,
        )
    elif message.role == "system":
        assert isinstance(
            message.content, str
        ), "System message content must be a string"
        return ChatCompletionSystemMessageParam(role="system", content=message.content)
    elif message.role == "user":
        assert message.content is not None, "User message content must not be None"
        return ChatCompletionUserMessageParam(role="user", content=message.content)
    else:
        raise ValueError(f"Unknown message role {message.role}")


async def run_tool(
    context: ProcessingContext,
    thread_id: str,
    tool_call: ChatCompletionMessageToolCall,
    tools: Sequence[Tool],
) -> ToolCall:
    """
    Executes a tool call based on the provided tool_call object.

    Args:
        context (ProcessingContext): The processing context.
        thread_id (str): The ID of the thread.
        tool_call (ChatCompletionMessageToolCall): The tool call object containing the function name and arguments.
        tools (list[Tool]): The list of tools to use for the tool call.

    Returns:
        ToolCall: The tool call object containing the function name, arguments, and response.
    """

    print(f"******* [[TOOL]] {tool_call.function.name} *******")

    function_name = tool_call.function.name.strip()
    function_args = tool_call.function.arguments

    def find_tool(name):
        for tool in tools:
            if tool.name == name:
                return tool
        return None

    tool = find_tool(function_name)

    assert tool is not None, f"Tool {function_name} not found"

    function_response = await tool.process(context, thread_id, function_args)

    content = json.dumps(function_response, default=default_serializer)
    message = await context.create_message(
        MessageCreateRequest(
            thread_id=thread_id,
            user_id=context.user_id,
            role="tool",
            tool_call_id=tool_call.id,
            name=function_name,
            content=content,
        )
    )

    print(f"******* [[TOOL RESPONSE]] {function_response} *******")

    return ToolCall(
        id=tool_call.id,
        function_name=function_name,
        function_args=function_args,
        function_response=function_response,
    )


async def process_tool_calls(
    context: ProcessingContext,
    thread_id: str,
    message: Message,
    tools: Sequence[Tool],
) -> list[ToolCall]:
    """
    Process tool calls from the last message.

    Args:
        model (FunctionModel): The function model.
        context (ProcessingContext): The processing context.
        thread_id (str): The thread ID.
        message (Message): The last message in the thread.
        columns (list[ColumnDef] | None, optional): The list of column definitions for the create_record tool. Defaults to None.

    Returns:
        Message: The assistant message.

    """

    tool_calls = message.tool_calls

    assert tool_calls is not None, "Tool calls must not be None"
    assert len(tool_calls) > 0, "At least one tool call is required"

    tool_call_messages = [
        ChatCompletionMessageToolCall(
            type="function",
            id=tool_call.id,
            function=Function(
                name=tool_call.function_name,
                arguments=tool_call.function_args,
            ),
        )
        for tool_call in tool_calls
    ]
    tool_responses = await asyncio.gather(
        *[
            run_tool(
                context=context,
                thread_id=thread_id,
                tool_call=tool_call_message,
                tools=tools,
            )
            for tool_call_message in tool_call_messages
        ]
    )
    return tool_responses


async def process_tool_responses(
    context: ProcessingContext,
    model: FunctionModel,
    thread_id: str,
    messages: list[Message],
    tool_responses: Sequence[ToolCall],
    **kwargs,
):
    messages_for_request = messages + [
        ChatCompletionToolMessageParam(
            role="tool",
            tool_call_id=tool_call.id,
            content=tool_call.function_response,
        )
        for tool_call in tool_responses
    ]
    response = await create_completion(
        context=context,
        model=model,
        messages=messages_for_request,  # type: ignore
        **kwargs,
    )
    assistant_message = await context.create_message(
        MessageCreateRequest(
            thread_id=thread_id,
            user_id=context.user_id,
            role="assistant",
            content=response.content,
            tool_calls=response.tool_calls,
        )
    )
    return assistant_message


async def process_messages(
    context: ProcessingContext,
    messages: Sequence[Message],
    model: FunctionModel,
    thread_id: str,
    tools: Sequence[Tool] = [],
    **kwargs,
) -> Message:
    """
    Process a message in a thread.

    Args:
        context (ProcessingContext): The processing context.
        messages (list[Message]): The messages in the thread.
        model (str): The model to use for the completion.
        thread_id (str): The ID of the thread.
        tools (list[Tool], optional): The tools to use for the completion. Defaults to [].

    Returns:
        tuple[Message, list[ToolCall]]: The assistant message and the tool calls.
    """

    messages_for_request = [message_param(message) for message in messages]

    response_message = await create_completion(
        context=context,
        model=model,
        messages=messages_for_request,  # type: ignore
        tools=tools,
        **kwargs,
    )

    assistant_message = await context.create_message(
        MessageCreateRequest(
            thread_id=thread_id,
            user_id=context.user_id,
            role="assistant",
            content=response_message.content,
            tool_calls=response_message.tool_calls,
        )
    )

    return assistant_message
