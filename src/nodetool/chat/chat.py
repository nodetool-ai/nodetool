import asyncio
from datetime import datetime
import json
import re
from typing import Any, Sequence

from pydantic import BaseModel
from anthropic.types.message_param import MessageParam
from nodetool.chat.tools import Tool
from openai.types.chat import (
    ChatCompletionMessageParam,
    ChatCompletionToolMessageParam,
    ChatCompletionSystemMessageParam,
    ChatCompletionUserMessageParam,
    ChatCompletionAssistantMessageParam,
    ChatCompletionMessageToolCallParam,
    ChatCompletionContentPartParam,
)
from openai.types.chat.chat_completion_message_tool_call_param import Function
from nodetool.metadata.types import (
    ChatAssistantMessageParam,
    ChatMessageParam,
    ChatSystemMessageParam,
    ChatToolMessageParam,
    ChatUserMessageParam,
    ColumnDef,
    FunctionModel,
    Message,
    Provider,
    ToolCall,
)
from nodetool.metadata.types import (
    MessageContent,
    MessageImageContent,
    MessageTextContent,
)
from nodetool.workflows.processing_context import ProcessingContext


def json_schema_for_column(column: ColumnDef) -> dict:
    """
    Create a JSON schema for a column.

    Args:
        column (ColumnDef): The column definition.

    Returns:
        dict: The JSON schema for the column.
    """
    data_type = column.data_type
    description = column.description or ""

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
) -> ChatCompletionContentPartParam:
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
        return {"type": "image_url", "image_url": {"url": content.image.uri}}
    else:
        raise ValueError(f"Unknown content type {content}")


def convert_to_llama_format(messages: Sequence[ChatMessageParam]) -> str:
    """
    Convert OpenAI-style message list to Llama chat format.

    Args:
        messages (list[ChatMessageParam]): The list of messages to convert.

    Returns:
        str: The Llama chat format.
    """
    res = ""

    for message in messages:
        if isinstance(message, ChatSystemMessageParam):
            res += f"[INST] {message.content} [/INST]\n"
        elif isinstance(message, ChatUserMessageParam):
            res += f"<human>: {message.content} </s>\n"
        elif isinstance(message, ChatAssistantMessageParam):
            res += f"<assistant>: {message.content} </s>\n"
        else:
            raise ValueError(f"Unknown message type {message}")

    return res.strip()


def convert_to_openai_message(
    message: ChatMessageParam,
) -> ChatCompletionMessageParam:
    """
    Convert a message to an OpenAI message.

    Args:
        message (ChatCompletionMessageParam): The message to convert.

    Returns:
        dict: The OpenAI message.
    """
    if isinstance(message, ChatToolMessageParam):
        if isinstance(message.content, BaseModel):
            content = message.content.model_dump_json()
        else:
            content = json.dumps(message.content)
        return ChatCompletionToolMessageParam(
            role=message.role,
            content=content,
            tool_call_id=message.tool_call_id,
        )
    elif isinstance(message, ChatSystemMessageParam):
        return ChatCompletionSystemMessageParam(
            role=message.role, content=message.content
        )
    elif isinstance(message, ChatUserMessageParam):
        assert message.content is not None, "User message content must not be None"
        if isinstance(message.content, str):
            content = message.content
        else:
            content = [
                message_content_to_openai_content_part(c) for c in message.content
            ]

        return ChatCompletionUserMessageParam(role=message.role, content=content)
    elif isinstance(message, ChatAssistantMessageParam):
        assert message.tool_calls is not None, "Tool calls must not be None"
        tool_calls = [
            ChatCompletionMessageToolCallParam(
                type="function",
                id=tool_call.id,
                function=Function(
                    name=tool_call.name,
                    arguments=json.dumps(tool_call.args, default=default_serializer),
                ),
            )
            for tool_call in message.tool_calls
        ]
        if len(tool_calls) == 0:
            return ChatCompletionAssistantMessageParam(
                role=message.role, content=message.content
            )
        return ChatCompletionAssistantMessageParam(
            role=message.role, content=message.content, tool_calls=tool_calls
        )
    else:
        raise ValueError(f"Unknown message type {message}")


async def create_openai_completion(
    context: ProcessingContext,
    model: FunctionModel,
    node_id: str,
    messages: Sequence[ChatMessageParam],
    tools: Sequence[Tool] = [],
    tool_choice: dict[str, Any] = {},
    **kwargs,
) -> Message:
    """
    Creates an OpenAI completion using the provided messages.

    Args:
        context (ProcessingContext): The processing context.
        model (FunctionModel): The model to use for the completion.
        node_id (str): The ID of the node that is making the request.
        messages (list[ChatCompletionMessageParam]): Entire conversation history.
        tools (list[ChatCompletionToolParam]): A list of tools to be used by the model.
        tool_choice (str, optional): Enforce specific tool. Defaults to "auto".
        **kwargs: Additional keyword arguments passed to openai API.

    Returns:
        Message: The message returned by the OpenAI API.
    """

    if len(tools) > 0:
        kwargs["tools"] = [tool.tool_param() for tool in tools]
        if len(tool_choice) > 0:
            kwargs["tool_choice"] = {
                "type": "function",
                "function": {
                    "name": tool_choice["name"],
                },
            }

    openai_messages = [convert_to_openai_message(m) for m in messages]

    completion = await context.run_prediction(
        model=model.name,
        provider=Provider.OpenAI,
        node_id=node_id,
        params={"messages": openai_messages, **kwargs},
    )
    assert completion["choices"] is not None, "No completion content returned"
    assert len(completion["choices"]) > 0, "No completion content returned"
    assert (
        completion["choices"][0]["message"] is not None
    ), "No completion content returned"

    response_message = completion["choices"][0]["message"]
    tool_calls = []

    if "tool_calls" in response_message and response_message["tool_calls"] is not None:
        for tool_call in response_message["tool_calls"]:
            tool_calls.append(
                ToolCall(
                    id=tool_call["id"],
                    name=tool_call["function"]["name"],
                    args=json.loads(tool_call["function"]["arguments"]),
                )
            )

    return Message(
        role="assistant", content=response_message["content"], tool_calls=tool_calls
    )


async def create_anthropic_completion(
    context: ProcessingContext,
    model: FunctionModel,
    node_id: str,
    messages: Sequence[ChatMessageParam],
    tools: Sequence[Tool] = [],
    tool_choice: dict[str, Any] = {},
    **kwargs,
) -> Message:
    """
    Creates an anthropic completion by sending messages to the anthropic client.

    Args:
        context (ProcessingContext): The processing context.
        model (FunctionModel): The model to use for generating the completion.
        node_id (str): The ID of the node that is making the request.
        messages (list[ChatCompletionMessageParam]): Entire conversation history.
        tools (list[Tool], optional): The list of tools to use. Defaults to [].
        tool_choice (dict[str, Any], optional): Enforce specific tool.
        **kwargs: Additional keyword arguments passed to the anthropic client.

    Returns:
        Message: The message returned by the anthropic client.

    Raises:
        ValueError: If no completion content is returned.
    """

    def convert_message(message: ChatMessageParam) -> MessageParam:
        if isinstance(message, ChatToolMessageParam):
            return {
                "role": "tool",
                "content": {
                    "type": "tool_result",
                    "tool_use_id": message.tool_call_id,
                    "content": [{"type": "text", "text": str(message.content)}],
                    "is_error": False,
                },  # type: ignore
            }
        elif isinstance(message, ChatSystemMessageParam):
            return {
                "type": "text",
                "text": message.content,
                "cache_control": {"type": "ephemeral"},
            }  # type: ignore
        else:
            return {"role": message.role, "content": message.content}  # type: ignore

    def convert_tool(tool: Tool) -> dict:
        return {
            "name": tool.name,
            "description": tool.description,
            "input_schema": tool.input_schema,
        }

    system_messages = [
        message for message in messages if isinstance(message, ChatSystemMessageParam)
    ]
    messages = [
        message
        for message in messages
        if not isinstance(message, ChatSystemMessageParam)
        and not message.role == "tool"
    ]
    if len(tool_choice) > 0:
        kwargs["tool_choice"] = tool_choice

    completion = await context.run_prediction(
        model=model.name,
        provider=Provider.Anthropic,
        node_id=node_id,
        params={
            "system": [convert_message(message) for message in system_messages],
            "messages": [convert_message(message) for message in messages],
            "tools": [convert_tool(tool) for tool in tools],
            **kwargs,
        },
    )
    assert completion["content"] is not None, "No completion content returned"

    message = None
    tool_calls = []

    for content in completion["content"]:
        if content["type"] == "text":
            message = Message(role="assistant", content=content["text"])
        elif content["type"] == "tool_use":
            tool_calls.append(
                ToolCall(
                    id=content["id"],
                    name=content["name"],
                    args=dict(content["input"]),
                )
            )

    assert message is not None, "No completion content returned"

    message.tool_calls = tool_calls

    return message


def parse_tool_calls(s) -> list[ToolCall]:
    """
    Parse a tool call from a string.
    Example: '[{"name": "create_record", "arguments": {"name": "John"}}]\n\n[{"name": "create_record", "arguments": {"name": "Jane"}}]\n\n[{"name": "create_record", "arguments": {"name": "Bob"}}]\n\n"
    """
    # Find the function call JSON strings
    calls = re.findall(r"\[.*?\]", s)
    res = []
    for call in calls:
        try:
            parsed = json.loads(call)
            for p in parsed:
                res.append(ToolCall(name=p["name"], args=p["arguments"]))
        except json.JSONDecodeError:
            continue
    return res


async def create_ollama_completion(
    context: ProcessingContext,
    model: FunctionModel,
    node_id: str,
    messages: Sequence[ChatMessageParam],
    tools: Sequence[Tool] = [],
    tool_choice: dict[str, Any] = {},
    **kwargs,
) -> Message:
    """
    Creates an Ollama completion by sending messages to the Ollama client.

    Args:
        context (ProcessingContext): The processing context.
        model (FunctionModel): The model to use for generating the completion.
        node_id (str): The ID of the node that is making the request.
        messages (list[ChatCompletionMessageParam]): Entire conversation history.
        tools (list[Tool], optional): The list of tools to use. Defaults to [].
        tool_choice (dict[str, Any], optional): Enforce specific tool.
        **kwargs: Additional keyword arguments passed to the Ollama client.

    Returns:
        Message: The message returned by the Ollama client.

    Raises:
        ValueError: If no completion content is returned.
    """

    if len(tools) > 0:
        # TODO: encode tool choice
        tool_prompt = """[AVAILABLE_TOOLS]\n{}\n[/AVAILABLE_TOOLS]""".format(
            json.dumps([tool.tool_param().model_dump() for tool in tools])
        )
        prompt = tool_prompt + convert_to_llama_format(messages)
    else:
        prompt = convert_to_llama_format(messages)

    print(f"******* [[PROMPT]] {prompt} *******")

    completion = await context.run_prediction(
        node_id=node_id,
        provider=Provider.Ollama,
        model=model.name,
        params={"raw": True, "prompt": prompt},
    )
    assert completion["response"] is not None, "No completion content returned"

    if len(tools) > 0:
        tool_calls = parse_tool_calls(completion["response"])
        return Message(role="assistant", content="", tool_calls=tool_calls)
    else:
        return Message(role="assistant", content=completion["response"])


async def create_completion(
    context: ProcessingContext,
    model: FunctionModel,
    **kwargs,
) -> Message:
    if model.provider == Provider.OpenAI:
        return await create_openai_completion(
            context=context,
            model=model,
            **kwargs,
        )
    elif model.provider == Provider.Anthropic:
        return await create_anthropic_completion(
            context=context,
            model=model,
            **kwargs,
        )
    elif model.provider == Provider.Ollama:
        return await create_ollama_completion(
            context=context,
            model=model,
            **kwargs,
        )
    else:
        raise ValueError(f"Provider {model.provider} not supported")


def message_param(message: Message) -> ChatMessageParam:
    """
    Converts a given message object to the corresponding ChatMessageParam object based on the message role.

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
        return ChatAssistantMessageParam(
            role="assistant", content=message.content, tool_calls=message.tool_calls
        )
    elif message.role == "tool":
        assert message.tool_call_id is not None, "Tool message must have a tool call ID"
        assert isinstance(message.content, str), "Tool message content must be a string"
        return ChatToolMessageParam(
            role="tool",
            tool_call_id=message.tool_call_id,
            content=message.content,
        )
    elif message.role == "system":
        assert isinstance(
            message.content, str
        ), "System message content must be a string"
        return ChatSystemMessageParam(role="system", content=message.content)
    elif message.role == "user":
        assert message.content is not None, "User message content must not be None"
        return ChatUserMessageParam(role="user", content=message.content)
    else:
        raise ValueError(f"Unknown message role {message.role}")


async def run_tool(
    context: ProcessingContext,
    tool_call: ToolCall,
    tools: Sequence[Tool],
) -> ToolCall:
    """
    Executes a tool call requested by the chat model.

    Args:
        context (ProcessingContext): The processing context.
        thread_id (str): The ID of the thread.
        tool_call (ToolCall): The tool call object containing the function name and arguments.
        tools (list[Tool]): The list of tools to use for the tool call.

    Returns:
        ToolCall: The tool call object containing the function name, arguments, and response.
    """

    print(f"******* [[TOOL]] {tool_call.name} *******")

    def find_tool(name):
        for tool in tools:
            if tool.name == name:
                return tool
        return None

    tool = find_tool(tool_call.name)

    assert tool is not None, f"Tool {tool_call.name} not found"

    result = await tool.process(context, tool_call.args)

    content = json.dumps(result, default=default_serializer)
    print(f"******* [[TOOL RESULT]] {result} *******")

    return ToolCall(
        id=tool_call.id,
        name=tool_call.name,
        args=tool_call.args,
        result=result,
    )


async def process_tool_calls(
    context: ProcessingContext,
    tool_calls: Sequence[ToolCall],
    tools: Sequence[Tool],
) -> list[ToolCall]:
    """
    Process tool calls in parallel.
    Looks up the tool by name and executes the tool's process method.
    It is required to call process_tool_responses if you want the chat model to respond to the tool calls.

    Args:
        context (ProcessingContext): The processing context.
        tool_calls (list[ToolCall]): The list of tool calls.
        columns (list[ColumnDef] | None, optional): The list of column definitions for the create_record tool. Defaults to None.

    Returns:
        Message: The assistant message.

    """
    return await asyncio.gather(
        *[
            run_tool(
                context=context,
                tool_call=tool_call,
                tools=tools,
            )
            for tool_call in tool_calls
        ]
    )


async def process_tool_responses(
    context: ProcessingContext,
    model: FunctionModel,
    node_id: str,
    thread_id: str,
    messages: list[Message],
    tool_responses: Sequence[ToolCall],
    **kwargs,
):
    """
    Process tool responses by the given chat model.
    This is used to let the chat model use the result from the tool calls to generate a response.

    Args:
        context (ProcessingContext): The processing context.
        model (FunctionModel): The function model.
        node_id (str): The node ID.
        thread_id (str): The thread ID.
        messages (list[Message]): The list of messages.
        tool_responses (Sequence[ToolCall]): The sequence of tool responses.
        **kwargs: Additional keyword arguments.

    Returns:
        The completion created.

    """
    messages_for_request = [message_param(message) for message in messages]

    messages_for_request += [
        ChatToolMessageParam(
            role="tool",
            tool_call_id=tool_call.id,
            content=tool_call.result,
        )
        for tool_call in tool_responses
    ]
    return await create_completion(
        context=context,
        model=model,
        node_id=node_id,
        thread_id=thread_id,
        messages=messages_for_request,
        **kwargs,
    )


async def process_messages(
    context: ProcessingContext,
    messages: Sequence[Message],
    model: FunctionModel,
    node_id: str,
    tools: Sequence[Tool] = [],
    tool_choice: dict[str, str] = {},
    **kwargs,
) -> Message:
    """
    Process a message by the given model.
    Creates a completion using the provided messages.
    If tools are provided, the model may respond with tool calls that need to be executed.
    Use process_tool_calls to execute the tool calls if needed.

    Args:
        context (ProcessingContext): The processing context.
        messages (list[Message]): The messages in the thread.
        model (str): The model to use for the completion.
        provider (Provider): The API provider to use for the completion.
        thread_id (str): The ID of the thread the message belongs to.
        node_id (str): The ID of the node making the request.
        tools (list[Tool], optional): The tools to use for the completion. Defaults to [].
        tool_choice (str, optional): Enforce specific tool. Defaults to "auto".

    Returns:
        tuple[Message, list[ToolCall]]: The assistant message and the tool calls.
    """

    return await create_completion(
        context=context,
        model=model,
        node_id=node_id,
        messages=[message_param(message) for message in messages],
        tools=tools,
        tool_choice=tool_choice,
        **kwargs,
    )
