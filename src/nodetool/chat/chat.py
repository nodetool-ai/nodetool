"""
Chat module providing multi-provider chat functionality with tool integration.

This module implements a chat interface that supports multiple AI providers (OpenAI, Anthropic, Ollama)
and allows for tool-augmented conversations. It handles:

- Message conversion between different provider formats
- Streaming chat completions
- Tool execution and integration
- CLI interface for interactive chat
- Provider-specific client management

The module supports various content types including text and images, and provides
a unified interface for handling tool calls across different providers.

Key components:
- Message conversion utilities for each provider
- Streaming completion handlers
- Tool execution framework
- Interactive CLI with command history and tab completion
"""

import asyncio
import json
import traceback
from typing import Any, AsyncGenerator, Sequence

import openai
from pydantic import BaseModel
from anthropic.types.message_param import MessageParam
from anthropic.types.image_block_param import ImageBlockParam
from anthropic.types.tool_param import ToolParam
from nodetool.chat.tools import (
    AddLabelTool,
    BrowserTool,
    ChromaHybridSearchTool,
    ChromaTextSearchTool,
    CreateAppleNoteTool,
    ExtractPDFTablesTool,
    ExtractPDFTextTool,
    ConvertPDFToMarkdownTool,
    FindNodeTool,
    KeywordDocSearchTool,
    ReadAppleNotesTool,
    ScreenshotTool,
    SearchEmailTool,
    SearchFileTool,
    SemanticDocSearchTool,
    Tool,
)
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
from nodetool.common.environment import Environment
from nodetool.metadata.types import (
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
from nodetool.providers.ollama.ollama_service import (
    get_ollama_client,
    get_ollama_models,
)
from nodetool.providers.openai.prediction import get_openai_models
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.chat.tools import ListDirectoryTool, ReadFileTool, WriteFileTool
import anthropic
import readline
import os


AVAILABLE_CHAT_TOOLS = [
    SearchEmailTool(),
    AddLabelTool(),
    ListDirectoryTool(),
    ReadFileTool(),
    WriteFileTool(),
    BrowserTool(),
    ScreenshotTool(),
    SearchFileTool(),
    ChromaTextSearchTool(),
    ChromaHybridSearchTool(),
    ExtractPDFTablesTool(),
    ExtractPDFTextTool(),
    ConvertPDFToMarkdownTool(),
    CreateAppleNoteTool(),
    ReadAppleNotesTool(),
    SemanticDocSearchTool(),
    KeywordDocSearchTool(),
]

AVAILABLE_CHAT_TOOLS_BY_NAME = {tool.name: tool for tool in AVAILABLE_CHAT_TOOLS}


def json_schema_for_column(column: ColumnDef) -> dict:
    """
    Create a JSON schema for a database column definition.

    Converts database column types to their corresponding JSON schema representations,
    including type information and descriptions.

    Args:
        column (ColumnDef): Column definition containing name, type, and description

    Returns:
        dict: JSON schema object with type and description fields

    Raises:
        ValueError: If the column data type is not supported
    """
    data_type = column.data_type
    description = column.description or ""

    if data_type == "string":
        return {"type": "string", "description": description}
    if data_type == "number":
        return {"type": "number", "description": description}
    if data_type == "int":
        return {"type": "integer", "description": description}
    if data_type == "float":
        return {"type": "number", "description": description}
    if data_type == "datetime":
        return {"type": "string", "format": "date-time", "description": description}
    raise ValueError(f"Unknown data type {data_type}")


def json_schema_for_dataframe(columns: list[ColumnDef]) -> dict:
    return {
        "type": "object",
        "properties": {
            "data": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        column.name: json_schema_for_column(column)
                        for column in columns
                    },
                    "required": [column.name for column in columns],
                    "additionalProperties": False,
                },
            }
        },
        "required": ["data"],
        "additionalProperties": False,
    }


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


def convert_to_openai_message(
    message: Message,
) -> ChatCompletionMessageParam:
    """
    Convert an internal message format to OpenAI's chat completion format.

    Handles conversion of different message roles (system, user, assistant, tool)
    and content types (text, images, tool calls) to OpenAI's expected format.

    Args:
        message (Message): Internal message object to convert

    Returns:
        ChatCompletionMessageParam: OpenAI-formatted message

    Raises:
        ValueError: If message role is unknown or content format is invalid
        AssertionError: If required fields are missing
    """
    if message.role == "tool":
        if isinstance(message.content, BaseModel):
            content = message.content.model_dump_json()
        else:
            content = json.dumps(message.content)
        assert message.tool_call_id is not None, "Tool call ID must not be None"
        return ChatCompletionToolMessageParam(
            role=message.role,
            content=content,
            tool_call_id=message.tool_call_id,
        )
    elif message.role == "system":
        return ChatCompletionSystemMessageParam(
            role=message.role, content=str(message.content)
        )
    elif message.role == "user":
        assert message.content is not None, "User message content must not be None"
        if isinstance(message.content, str):
            content = message.content
        elif message.content is not None:
            content = [
                message_content_to_openai_content_part(c) for c in message.content
            ]
        else:
            raise ValueError(f"Unknown message content type {type(message.content)}")
        return ChatCompletionUserMessageParam(role=message.role, content=content)
    elif message.role == "assistant":
        tool_calls = [
            ChatCompletionMessageToolCallParam(
                type="function",
                id=tool_call.id,
                function=Function(
                    name=tool_call.name,
                    arguments=json.dumps(tool_call.args, default=default_serializer),
                ),
            )
            for tool_call in message.tool_calls or []
        ]
        if isinstance(message.content, str):
            content = message.content
        elif message.content is not None:
            content = [
                message_content_to_openai_content_part(c) for c in message.content
            ]
        else:
            content = None
        if len(tool_calls) == 0:
            return ChatCompletionAssistantMessageParam(
                role=message.role,
                content=content,  # type: ignore
            )
        else:
            return ChatCompletionAssistantMessageParam(
                role=message.role, content=content, tool_calls=tool_calls  # type: ignore
            )
    else:
        raise ValueError(f"Unknown message role {message.role}")


def get_openai_client():
    env = Environment.get_environment()
    api_key = env.get("OPENAI_API_KEY")
    assert api_key, "OPENAI_API_KEY is not set"

    return openai.AsyncClient(api_key=api_key)


class Chunk(BaseModel):
    content: str
    done: bool


async def create_openai_completion(
    model: FunctionModel,
    messages: Sequence[Message],
    tools: Sequence[Tool] = [],
    **kwargs,
):
    """
    Create a streaming chat completion using OpenAI's API.

    Handles message conversion, tool integration, and streaming response processing.
    Automatically adapts system messages for O1/O3 models.

    Args:
        model (FunctionModel): Model configuration including name and provider
        messages (Sequence[Message]): Conversation history
        tools (Sequence[Tool], optional): Available tools for model use
        **kwargs: Additional arguments passed to OpenAI's API

    Yields:
        Union[Chunk, ToolCall]: Either content chunks or tool call requests

    Raises:
        ValueError: If tool call processing fails
        AssertionError: If tool call state is invalid
    """
    # Convert system messages to user messages for O1 and O3 models
    if model.name.startswith("o1") or model.name.startswith("o3"):
        kwargs["max_completion_tokens"] = kwargs.pop("max_tokens", 1000)
        kwargs.pop("temperature", None)
        converted_messages = []
        for msg in messages:
            if msg.role == "system":
                converted_messages.append(
                    Message(
                        role="user",
                        content=f"Instructions: {msg.content}",
                        thread_id=msg.thread_id,
                    )
                )
            else:
                converted_messages.append(msg)
        messages = converted_messages

    if len(tools) > 0:
        kwargs["tools"] = [tool.tool_param() for tool in tools]

    openai_messages = [convert_to_openai_message(m) for m in messages]
    client = get_openai_client()

    completion = await client.chat.completions.create(
        model=model.name,
        messages=openai_messages,
        stream=True,
        **kwargs,
    )

    current_tool_call = None
    async for chunk in completion:
        delta = chunk.choices[0].delta

        if delta.content or chunk.choices[0].finish_reason == "stop":
            yield Chunk(
                content=delta.content or "",
                done=chunk.choices[0].finish_reason == "stop",
            )

        if chunk.choices[0].finish_reason == "tool_calls":
            if current_tool_call:
                yield ToolCall(
                    id=current_tool_call["id"],
                    name=current_tool_call["name"],
                    args=json.loads(current_tool_call["args"]),
                )
            else:
                raise ValueError("No tool call found")

        if delta.tool_calls:
            for tool_call in delta.tool_calls:
                if tool_call.id:
                    current_tool_call = {
                        "id": tool_call.id,
                        "name": tool_call.function.name if tool_call.function else "",
                        "args": "",
                    }
                if tool_call.function and current_tool_call:
                    if tool_call.function.arguments:
                        current_tool_call["args"] += tool_call.function.arguments

                assert (
                    current_tool_call is not None
                ), "Current tool call must not be None"


def convert_to_anthropic_message(message: Message) -> MessageParam:
    if message.role == "tool":
        assert message.tool_call_id is not None, "Tool call ID must not be None"
        return {
            "role": "user",
            "content": [
                {
                    "type": "tool_result",
                    "tool_use_id": message.tool_call_id,
                    "content": str(message.content),
                }
            ],
        }
    elif message.role == "system":
        return {
            "role": "assistant",
            "content": str(message.content),
        }
    elif message.role == "user":
        assert message.content is not None, "User message content must not be None"
        if isinstance(message.content, str):
            return {"role": "user", "content": message.content}
        else:
            content = []
            for part in message.content:
                if isinstance(part, MessageTextContent):
                    content.append({"type": "text", "text": part.text})
                elif isinstance(part, MessageImageContent):
                    content.append(
                        ImageBlockParam(
                            type="image",
                            source={
                                "type": "base64",
                                "media_type": "image/png",
                                "data": part.image.uri,
                            },
                        )
                    )
            return {"role": "user", "content": content}
    elif message.role == "assistant":
        if isinstance(message.content, str):
            return {"role": "assistant", "content": message.content}
        else:
            content = []
            assert (
                message.content is not None
            ), "Assistant message content must not be None"
            for part in message.content:
                if isinstance(part, MessageTextContent):
                    content.append({"type": "text", "text": part.text})
            return {"role": "assistant", "content": content}
    else:
        raise ValueError(f"Unknown message role {message.role}")


def get_anthropic_client():
    env = Environment.get_environment()
    api_key = env.get("ANTHROPIC_API_KEY")
    assert api_key, "ANTHROPIC_API_KEY is not set"

    return anthropic.AsyncAnthropic(
        api_key=api_key,
        default_headers={"anthropic-beta": "prompt-caching-2024-07-31"},
    )


async def create_anthropic_completion(
    model: FunctionModel,
    messages: Sequence[Message],
    tools: Sequence[Tool] = [],
    **kwargs,
) -> AsyncGenerator[Chunk | ToolCall, Any]:
    """
    Creates an anthropic completion using streaming messages API.
    Handles message flow and tool calls according to Anthropic's format.

    Args:
        model (FunctionModel): The model to use for the completion.
        messages (Sequence[Message]): Entire conversation history.
        tools (Sequence[Tool], optional): The list of tools to use. Defaults to [].
        **kwargs: Additional keyword arguments passed to the anthropic client.

    Yields:
        Chunk | ToolCall: Either a content chunk or a tool call request.
    """

    def convert_tool(tool: Tool) -> ToolParam:
        return {
            "name": tool.name,
            "description": tool.description,
            "input_schema": tool.input_schema,
        }

    system_messages = [message for message in messages if message.role == "system"]
    system_message = (
        str(system_messages[0].content)
        if len(system_messages) > 0
        else "You are a helpful assistant."
    )

    # Convert messages and tools to Anthropic format
    anthropic_messages = [
        convert_to_anthropic_message(msg) for msg in messages if msg.role != "system"
    ]

    anthropic_tools: Sequence[ToolParam] = [convert_tool(tool) for tool in tools]

    client = get_anthropic_client()

    async with client.messages.stream(
        model=model.name,
        messages=anthropic_messages,
        system=system_message,
        tools=anthropic_tools,
        **kwargs,
    ) as stream:
        current_tool_call = None

        async for event in stream:
            if event.type == "content_block_delta":
                if event.delta.type == "text_delta":
                    yield Chunk(content=event.delta.text, done=False)
                elif event.delta.type == "input_json_delta":
                    # Accumulate tool call JSON
                    if current_tool_call is None:
                        current_tool_call = {
                            "id": event.index,
                            "name": "",
                            "args": event.delta.partial_json,
                        }
                    else:
                        current_tool_call["args"] += event.delta.partial_json

            elif event.type == "content_block_stop":
                if current_tool_call and current_tool_call["args"]:
                    try:
                        args = json.loads(current_tool_call["args"])
                        yield ToolCall(
                            id=str(current_tool_call["id"]),
                            name=current_tool_call["name"],
                            args=args,
                        )
                        current_tool_call = None
                    except json.JSONDecodeError:
                        pass  # Wait for complete JSON

            elif event.type == "message_stop":
                yield Chunk(content="", done=True)


def convert_to_ollama_message(
    message: Message,
) -> dict[str, Any]:
    """
    Convert a message to an Ollama message format.

    Args:
        message (Message): The message to convert.

    Returns:
        dict: The Ollama message with role and content fields.
    """
    if message.role == "tool":
        if isinstance(message.content, BaseModel):
            content = message.content.model_dump_json()
        else:
            content = json.dumps(message.content)
        return {"role": "tool", "content": content, "name": message.name}
    elif message.role == "system":
        return {"role": "system", "content": message.content}
    elif message.role == "user":
        assert message.content is not None, "User message content must not be None"
        message_dict: dict[str, Any] = {"role": "user"}

        if isinstance(message.content, str):
            message_dict["content"] = message.content
        else:
            # Handle text content
            text_parts = [
                part.text
                for part in message.content
                if isinstance(part, MessageTextContent)
            ]
            message_dict["content"] = "\n".join(text_parts)

            # Handle image content
            image_parts = [
                part.image.uri
                for part in message.content
                if isinstance(part, MessageImageContent)
            ]
            if image_parts:
                message_dict["images"] = image_parts

        return message_dict
    elif message.role == "assistant":
        return {
            "role": "assistant",
            "content": message.content or "",
            "tool_calls": [
                {
                    "function": {
                        "name": tool_call.name,
                        "arguments": tool_call.args,
                    },
                }
                for tool_call in message.tool_calls or []
            ],
        }
    else:
        raise ValueError(f"Unknown message role {message.role}")


async def create_ollama_completion(
    model: FunctionModel,
    messages: Sequence[Message],
    tools: Sequence[Tool] = [],
    **kwargs,
):
    """
    Creates an Ollama completion by sending messages to the Ollama client.

    Args:
        model (FunctionModel): The model to use for generating the completion.
        messages (list[Message]): Entire conversation history.
        tools (list[Tool], optional): The list of tools to use. Defaults to [].
        **kwargs: Additional keyword arguments passed to the Ollama client.

    Returns:
        Message: The message returned by the Ollama client.

    Raises:
        ValueError: If no completion content is returned.
    """
    ollama_messages = [convert_to_ollama_message(m) for m in messages]

    if len(tools) > 0:
        kwargs["tools"] = [tool.tool_param() for tool in tools]

    client = get_ollama_client()

    completion = await client.chat(
        model=model.name, messages=ollama_messages, stream=True, **kwargs
    )

    async for response in completion:
        if response.message.tool_calls is not None:
            for tool_call in response.message.tool_calls:
                yield ToolCall(
                    name=tool_call.function.name,
                    args=dict(tool_call.function.arguments),
                )
        yield Chunk(
            content=response.message.content or "",
            done=response.done or False,
        )


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

    def find_tool(name):
        for tool in tools:
            if tool.name == name:
                return tool
        return None

    tool = find_tool(tool_call.name)

    assert tool is not None, f"Tool {tool_call.name} not found"

    result = await tool.process(context, tool_call.args)

    return ToolCall(
        id=tool_call.id,
        name=tool_call.name,
        args=tool_call.args,
        result=result,
    )


async def run_tools(
    context: ProcessingContext,
    tool_calls: Sequence[ToolCall],
    tools: Sequence[Tool],
) -> list[ToolCall]:
    """
    Executes a list of tool calls in parallel.
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


async def generate_messages(
    messages: Sequence[Message],
    model: FunctionModel,
    tools: Sequence[Tool] = [],
    **kwargs,
) -> AsyncGenerator[Chunk | ToolCall, Any]:
    """
    Process a message by the given model.
    Creates a completion using the provided messages.
    If tools are provided, the model may respond with tool calls that need to be executed.
    Use process_tool_calls to execute the tool calls if needed.

    Args:
        messages (list[Message]): The messages in the thread.
        model (str): The model to use for the completion.
        provider (Provider): The API provider to use for the completion.
        tools (list[Tool], optional): The tools to use for the completion. Defaults to [].

    Returns:
        tuple[Message, list[ToolCall]]: The assistant message and the tool calls.
    """
    if model.provider == Provider.OpenAI:
        async for chunk in create_openai_completion(
            model=model,
            messages=messages,
            tools=tools,
            **kwargs,
        ):
            yield chunk
    elif model.provider == Provider.Ollama:
        async for chunk in create_ollama_completion(
            model=model,
            messages=messages,
            tools=tools,
            **kwargs,
        ):
            yield chunk
    elif model.provider == Provider.Anthropic:
        async for chunk in create_anthropic_completion(
            model=model,
            messages=messages,
            tools=tools,
            **kwargs,
        ):
            yield chunk
    else:
        raise ValueError(f"Provider {model.provider} not supported")


async def process_messages(
    messages: Sequence[Message],
    model: FunctionModel,
    tools: Sequence[Tool] = [],
    **kwargs,
) -> Message:
    """
    Process messages and return a single accumulated response message.

    Args:
        messages (Sequence[Message]): The messages to process
        model (FunctionModel): The model to use
        tools (Sequence[Tool]): Available tools
        **kwargs: Additional arguments passed to the model

    Returns:
        Message: The complete response message with content and tool calls
    """
    content = ""
    tool_calls: list[ToolCall] = []

    async for chunk in generate_messages(messages, model, tools, **kwargs):
        if isinstance(chunk, Chunk):
            content += chunk.content
        elif isinstance(chunk, ToolCall):
            tool_calls.append(chunk)

    return Message(
        role="assistant",
        content=content if content else None,
        tool_calls=tool_calls if tool_calls else None,
    )


async def chat_cli():
    """
    Interactive command-line chat interface with multi-provider support.

    Provides:
    - Command history with readline
    - Tab completion for commands
    - Provider switching
    - Model selection
    - Tool integration
    - Error handling and graceful shutdown

    Commands:
    - /help: Show available commands
    - /provider [name]: Switch provider
    - /model [name]: Change model
    - /models: List available models
    - /clear: Clear chat history
    - /quit or /exit: Exit the chat

    The CLI maintains conversation history and supports emacs-style line editing.
    """

    import warnings

    warnings.filterwarnings("ignore", category=UserWarning)

    context = ProcessingContext(user_id="test", auth_token="test")
    ollama_models = await get_ollama_models()
    openai_models = await get_openai_models()

    # Define default models for each provider
    default_models = {
        Provider.OpenAI: "gpt-4o",
        Provider.Anthropic: "claude-3-5-sonnet-20241022",
        Provider.Ollama: "llama3.2:3b",
    }

    provider = Provider.OpenAI
    model = FunctionModel(name=default_models[provider], provider=provider)
    messages: list[Message] = []

    # Set up readline
    histfile = os.path.join(os.path.expanduser("~"), ".nodetool_history")
    try:
        readline.read_history_file(histfile)
    except FileNotFoundError:
        pass

    # Enable tab completion
    COMMANDS = ["help", "quit", "exit", "provider", "model", "models", "clear"]
    PROVIDERS = [p.value.lower() for p in Provider]

    def completer(text, state):
        if text.startswith("/"):
            text = text[1:]
            options = [f"/{cmd}" for cmd in COMMANDS if cmd.startswith(text)]
        elif text.startswith("/model "):
            model_text = text.split()[-1]
            options = [
                f"/model {m}" for m in ollama_models if m.name.startswith(model_text)
            ]
            options.extend(
                [f"/model {m}" for m in openai_models if m.id.startswith(model_text)]
            )
        elif text.startswith("/provider "):
            provider_text = text.split()[-1]
            options = [
                f"/provider {p}" for p in PROVIDERS if p.startswith(provider_text)
            ]
        else:
            return None
        return options[state] if state < len(options) else None

    readline.set_completer(completer)
    readline.parse_and_bind("tab: complete")

    print("Chat CLI - Type /help for commands")

    while True:
        try:
            user_input = input("> ").strip()
            readline.write_history_file(histfile)

            if user_input.startswith("/"):
                cmd = user_input[1:].lower()
                if cmd == "quit" or cmd == "exit":
                    break
                elif cmd == "help":
                    print("Commands:")
                    print("  /provider [openai|anthropic|ollama] - Set the provider")
                    print("  /model [model_name] - Set the model")
                    print("  /models - List available Ollama models")
                    print("  /clear - Clear chat history")
                    print("  /quit or /exit - Exit the chat")
                    continue
                elif cmd == "models":
                    try:
                        print("\nAvailable Ollama models:")
                        for model_info in ollama_models:
                            print(f"- {model_info.name}")
                        print()
                    except Exception as e:
                        print(f"Error listing models: {e}")
                    continue
                elif cmd.startswith("provider "):
                    provider_name = cmd.split()[1].capitalize()
                    try:
                        provider = Provider[provider_name]
                        # Update model to default for new provider
                        model = FunctionModel(
                            name=default_models[provider], provider=provider
                        )
                        print(
                            f"Provider set to {provider.value} with default model {default_models[provider]}"
                        )
                    except KeyError:
                        print(
                            f"Invalid provider. Choose from: {[p.value for p in Provider]}"
                        )
                    continue
                elif cmd.startswith("model "):
                    model_name = cmd.split()[1]
                    model = FunctionModel(name=model_name, provider=provider)
                    print(f"Model set to {model_name}")
                    continue
                elif cmd == "clear":
                    messages = []
                    print("Chat history cleared")
                    continue
                else:
                    print("Unknown command. Type /help for available commands")
                    continue

            # Add user message
            messages.append(Message(role="user", content=user_input))
            current_chunk = ""
            unprocessed_messages = messages

            while unprocessed_messages:
                messages_to_send = messages + unprocessed_messages
                unprocessed_messages = []
                async for chunk in generate_messages(
                    messages=messages_to_send,
                    model=model,
                    tools=AVAILABLE_CHAT_TOOLS,
                ):
                    if isinstance(chunk, Chunk):
                        current_chunk += str(chunk.content)
                        print(chunk.content, end="", flush=True)
                        messages.append(
                            Message(role="assistant", content=current_chunk)
                        )
                        if chunk.done:
                            print("")

                    if isinstance(chunk, ToolCall):
                        print(f"Running {chunk.name} with {chunk.args}")
                        tool_result = await run_tool(
                            context, chunk, AVAILABLE_CHAT_TOOLS
                        )
                        # print(tool_result)
                        unprocessed_messages.append(
                            Message(role="assistant", tool_calls=[chunk])
                        )
                        unprocessed_messages.append(
                            Message(
                                role="tool",
                                tool_call_id=tool_result.id,
                                name=chunk.name,
                                content=json.dumps(
                                    tool_result.result, default=default_serializer
                                ),
                            )
                        )

        except KeyboardInterrupt:
            return
        except EOFError:
            return
        except Exception as e:
            print(f"Error: {e}")
            stacktrace = traceback.format_exc()
            print(f"Stacktrace: {stacktrace}")


if __name__ == "__main__":
    asyncio.run(chat_cli())
