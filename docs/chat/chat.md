# nodetool.chat.chat

## Function: `convert_to_llama_format(messages: Sequence[nodetool.metadata.types.ChatMessageParam]) -> str`

Convert OpenAI-style message list to Llama chat format.

    :param messages: List of dictionaries, each containing 'role' and 'content' keys
    :return: String in Llama chat format

**Parameters:**

- `messages` (typing.Sequence[nodetool.metadata.types.ChatMessageParam])

**Returns:** `str`

## Function: `convert_to_openai_message(message: nodetool.metadata.types.ChatMessageParam) -> Union[openai.types.chat.chat_completion_system_message_param.ChatCompletionSystemMessageParam, openai.types.chat.chat_completion_user_message_param.ChatCompletionUserMessageParam, openai.types.chat.chat_completion_assistant_message_param.ChatCompletionAssistantMessageParam, openai.types.chat.chat_completion_tool_message_param.ChatCompletionToolMessageParam, openai.types.chat.chat_completion_function_message_param.ChatCompletionFunctionMessageParam]`

Convert a message to an OpenAI message.

    Args:
        message (ChatCompletionMessageParam): The message to convert.

    Returns:
        dict: The OpenAI message.

**Parameters:**

- `message` (ChatMessageParam)

**Returns:** `typing.Union[openai.types.chat.chat_completion_system_message_param.ChatCompletionSystemMessageParam, openai.types.chat.chat_completion_user_message_param.ChatCompletionUserMessageParam, openai.types.chat.chat_completion_assistant_message_param.ChatCompletionAssistantMessageParam, openai.types.chat.chat_completion_tool_message_param.ChatCompletionToolMessageParam, openai.types.chat.chat_completion_function_message_param.ChatCompletionFunctionMessageParam]`

## Function: `create_anthropic_completion(context: nodetool.workflows.processing_context.ProcessingContext, model: nodetool.metadata.types.FunctionModel, node_id: str, messages: Sequence[nodetool.metadata.types.ChatMessageParam], tools: Sequence[nodetool.chat.tools.Tool] = [], tool_choice: dict[str, typing.Any] = {}, **kwargs) -> nodetool.metadata.types.Message`

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

**Parameters:**

- `context` (ProcessingContext)
- `model` (FunctionModel)
- `node_id` (str)
- `messages` (typing.Sequence[nodetool.metadata.types.ChatMessageParam])
- `tools` (typing.Sequence[nodetool.chat.tools.Tool]) (default: `[]`)
- `tool_choice` (dict[str, typing.Any]) (default: `{}`)
- `kwargs`

**Returns:** `Message`

## Function: `create_completion(context: nodetool.workflows.processing_context.ProcessingContext, model: nodetool.metadata.types.FunctionModel, node_id: str, thread_id: str, messages: Sequence[nodetool.metadata.types.ChatMessageParam], tools: Sequence[nodetool.chat.tools.Tool], tool_choice: dict[str, typing.Any], **kwargs) -> nodetool.metadata.types.Message`

**Parameters:**

- `context` (ProcessingContext)
- `model` (FunctionModel)
- `node_id` (str)
- `thread_id` (str)
- `messages` (typing.Sequence[nodetool.metadata.types.ChatMessageParam])
- `tools` (typing.Sequence[nodetool.chat.tools.Tool])
- `tool_choice` (dict[str, typing.Any])
- `kwargs`

**Returns:** `Message`

## Function: `create_ollama_completion(context: nodetool.workflows.processing_context.ProcessingContext, model: nodetool.metadata.types.FunctionModel, node_id: str, messages: Sequence[nodetool.metadata.types.ChatMessageParam], tools: Sequence[nodetool.chat.tools.Tool] = [], tool_choice: dict[str, typing.Any] = {}, **kwargs) -> nodetool.metadata.types.Message`

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

**Parameters:**

- `context` (ProcessingContext)
- `model` (FunctionModel)
- `node_id` (str)
- `messages` (typing.Sequence[nodetool.metadata.types.ChatMessageParam])
- `tools` (typing.Sequence[nodetool.chat.tools.Tool]) (default: `[]`)
- `tool_choice` (dict[str, typing.Any]) (default: `{}`)
- `kwargs`

**Returns:** `Message`

## Function: `create_openai_completion(context: nodetool.workflows.processing_context.ProcessingContext, model: nodetool.metadata.types.FunctionModel, node_id: str, messages: Sequence[nodetool.metadata.types.ChatMessageParam], tools: Sequence[nodetool.chat.tools.Tool] = [], tool_choice: dict[str, typing.Any] = {}, **kwargs) -> nodetool.metadata.types.Message`

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

**Parameters:**

- `context` (ProcessingContext)
- `model` (FunctionModel)
- `node_id` (str)
- `messages` (typing.Sequence[nodetool.metadata.types.ChatMessageParam])
- `tools` (typing.Sequence[nodetool.chat.tools.Tool]) (default: `[]`)
- `tool_choice` (dict[str, typing.Any]) (default: `{}`)
- `kwargs`

**Returns:** `Message`

## Function: `default_serializer(obj: Any) -> dict`

**Parameters:**

- `obj` (Any)

**Returns:** `dict`

## Function: `json_schema_for_column(column: nodetool.metadata.types.ColumnDef) -> dict`

Create a JSON schema for a column.

    Args:
        column (ColumnDef): The column definition.

    Returns:
        dict: The JSON schema for the column.

**Parameters:**

- `column` (ColumnDef)

**Returns:** `dict`

## Function: `message_content_to_openai_content_part(content: nodetool.models.message.MessageTextContent | nodetool.models.message.MessageImageContent) -> Union[openai.types.chat.chat_completion_content_part_text_param.ChatCompletionContentPartTextParam, openai.types.chat.chat_completion_content_part_image_param.ChatCompletionContentPartImageParam]`

Convert a message content to an OpenAI content part.

    Args:
        content (MessageContent): The message content to convert.

    Returns:
        OpenAIChatCompletionContentPartParam: The OpenAI content part.

**Parameters:**

- `content` (nodetool.models.message.MessageTextContent | nodetool.models.message.MessageImageContent)

**Returns:** `typing.Union[openai.types.chat.chat_completion_content_part_text_param.ChatCompletionContentPartTextParam, openai.types.chat.chat_completion_content_part_image_param.ChatCompletionContentPartImageParam]`

## Function: `message_param(message: nodetool.metadata.types.Message) -> nodetool.metadata.types.ChatMessageParam`

Converts a given message object to the corresponding ChatMessageParam object based on the message role.

    Args:
        message (Message): The message object to convert.

    Returns:
        ChatCompletionMessageParam: The converted ChatCompletionMessageParam object.

    Raises:
        ValueError: If the message role is unknown.
        AssertionError: If the message content or tool call ID is not of the expected type.

**Parameters:**

- `message` (Message)

**Returns:** `ChatMessageParam`

## Function: `parse_tool_calls(s) -> list[nodetool.models.message.ToolCall]`

Parse a tool call from a string.
    Example: '[{"name": "create_record", "arguments": {"name": "John"}}]

[{"name": "create_record", "arguments": {"name": "Jane"}}]

[{"name": "create_record", "arguments": {"name": "Bob"}}]

"

**Parameters:**

- `s`

**Returns:** `list[nodetool.models.message.ToolCall]`

## Function: `process_messages(context: nodetool.workflows.processing_context.ProcessingContext, messages: Sequence[nodetool.metadata.types.Message], model: nodetool.metadata.types.FunctionModel, thread_id: str, node_id: str, tools: Sequence[nodetool.chat.tools.Tool] = [], tool_choice: dict[str, str] = {}, **kwargs) -> nodetool.metadata.types.Message`

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

**Parameters:**

- `context` (ProcessingContext)
- `messages` (typing.Sequence[nodetool.metadata.types.Message])
- `model` (FunctionModel)
- `thread_id` (str)
- `node_id` (str)
- `tools` (typing.Sequence[nodetool.chat.tools.Tool]) (default: `[]`)
- `tool_choice` (dict[str, str]) (default: `{}`)
- `kwargs`

**Returns:** `Message`

## Function: `process_tool_calls(context: nodetool.workflows.processing_context.ProcessingContext, thread_id: str, tool_calls: Sequence[nodetool.models.message.ToolCall], tools: Sequence[nodetool.chat.tools.Tool]) -> list[nodetool.models.message.ToolCall]`

Process tool calls in parallel.
    Looks up the tool by name and executes the tool's process method.
    It is required to call process_tool_responses if you want the chat model to respond to the tool calls.

    Args:
        context (ProcessingContext): The processing context.
        thread_id (str): The thread ID.
        tool_calls (list[ToolCall]): The list of tool calls.
        columns (list[ColumnDef] | None, optional): The list of column definitions for the create_record tool. Defaults to None.

    Returns:
        Message: The assistant message.

**Parameters:**

- `context` (ProcessingContext)
- `thread_id` (str)
- `tool_calls` (typing.Sequence[nodetool.models.message.ToolCall])
- `tools` (typing.Sequence[nodetool.chat.tools.Tool])

**Returns:** `list[nodetool.models.message.ToolCall]`

## Function: `process_tool_responses(context: nodetool.workflows.processing_context.ProcessingContext, model: nodetool.metadata.types.FunctionModel, node_id: str, thread_id: str, messages: list[nodetool.metadata.types.Message], tool_responses: Sequence[nodetool.models.message.ToolCall], **kwargs)`

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

**Parameters:**

- `context` (ProcessingContext)
- `model` (FunctionModel)
- `node_id` (str)
- `thread_id` (str)
- `messages` (list[nodetool.metadata.types.Message])
- `tool_responses` (typing.Sequence[nodetool.models.message.ToolCall])
- `kwargs`

## Function: `run_tool(context: nodetool.workflows.processing_context.ProcessingContext, thread_id: str, tool_call: nodetool.models.message.ToolCall, tools: Sequence[nodetool.chat.tools.Tool]) -> nodetool.models.message.ToolCall`

Executes a tool call requested by the chat model.

    Args:
        context (ProcessingContext): The processing context.
        thread_id (str): The ID of the thread.
        tool_call (ToolCall): The tool call object containing the function name and arguments.
        tools (list[Tool]): The list of tools to use for the tool call.

    Returns:
        ToolCall: The tool call object containing the function name, arguments, and response.

**Parameters:**

- `context` (ProcessingContext)
- `thread_id` (str)
- `tool_call` (ToolCall)
- `tools` (typing.Sequence[nodetool.chat.tools.Tool])

**Returns:** `ToolCall`

