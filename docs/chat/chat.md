# nodetool.chat.chat

### convert_to_llama_format

Convert OpenAI-style message list to Llama chat format.


**Args:**

- **messages (list[ChatMessageParam])**: The list of messages to convert.


**Returns:**

- **str**: The Llama chat format.
**Args:**
- **messages (typing.Sequence[nodetool.metadata.types.ChatMessageParam])**

**Returns:** str

### convert_to_openai_message

Convert a message to an OpenAI message.


**Args:**

- **message (ChatCompletionMessageParam)**: The message to convert.


**Returns:**

- **dict**: The OpenAI message.
**Args:**
- **message (ChatMessageParam)**

**Returns:** typing.Union[openai.types.chat.chat_completion_system_message_param.ChatCompletionSystemMessageParam, openai.types.chat.chat_completion_user_message_param.ChatCompletionUserMessageParam, openai.types.chat.chat_completion_assistant_message_param.ChatCompletionAssistantMessageParam, openai.types.chat.chat_completion_tool_message_param.ChatCompletionToolMessageParam, openai.types.chat.chat_completion_function_message_param.ChatCompletionFunctionMessageParam]

### create_anthropic_completion

Creates an anthropic completion by sending messages to the anthropic client.


**Args:**

- **context (ProcessingContext)**: The processing context.
- **model (FunctionModel)**: The model to use for generating the completion.
- **node_id (str)**: The ID of the node that is making the request.
- **messages (list[ChatCompletionMessageParam])**: Entire conversation history.
- **tools (list[Tool], optional)**: The list of tools to use. Defaults to [].
- **tool_choice (dict[str, Any], optional)**: Enforce specific tool.
- ****kwargs**: Additional keyword arguments passed to the anthropic client.


**Returns:**

- **Message**: The message returned by the anthropic client.


**Raises:**

- **ValueError**: If no completion content is returned.
**Args:**
- **context (ProcessingContext)**
- **model (FunctionModel)**
- **node_id (str)**
- **messages (typing.Sequence[nodetool.metadata.types.ChatMessageParam])**
- **tools (typing.Sequence[nodetool.chat.tools.Tool]) (default: [])**
- **tool_choice (dict[str, typing.Any]) (default: {})**
- **kwargs**

**Returns:** Message

### create_completion

**Args:**
- **context (ProcessingContext)**
- **model (FunctionModel)**
- **kwargs**

**Returns:** Message

### create_ollama_completion

Creates an Ollama completion by sending messages to the Ollama client.


**Args:**

- **context (ProcessingContext)**: The processing context.
- **model (FunctionModel)**: The model to use for generating the completion.
- **node_id (str)**: The ID of the node that is making the request.
- **messages (list[ChatCompletionMessageParam])**: Entire conversation history.
- **tools (list[Tool], optional)**: The list of tools to use. Defaults to [].
- **tool_choice (dict[str, Any], optional)**: Enforce specific tool.
- ****kwargs**: Additional keyword arguments passed to the Ollama client.


**Returns:**

- **Message**: The message returned by the Ollama client.


**Raises:**

- **ValueError**: If no completion content is returned.
**Args:**
- **context (ProcessingContext)**
- **model (FunctionModel)**
- **node_id (str)**
- **messages (typing.Sequence[nodetool.metadata.types.ChatMessageParam])**
- **tools (typing.Sequence[nodetool.chat.tools.Tool]) (default: [])**
- **tool_choice (dict[str, typing.Any]) (default: {})**
- **kwargs**

**Returns:** Message

### create_openai_completion

Creates an OpenAI completion using the provided messages.


**Args:**

- **context (ProcessingContext)**: The processing context.
- **model (FunctionModel)**: The model to use for the completion.
- **node_id (str)**: The ID of the node that is making the request.
- **messages (list[ChatCompletionMessageParam])**: Entire conversation history.
- **tools (list[ChatCompletionToolParam])**: A list of tools to be used by the model.
- **tool_choice (str, optional)**: Enforce specific tool. Defaults to "auto".
- ****kwargs**: Additional keyword arguments passed to openai API.


**Returns:**

- **Message**: The message returned by the OpenAI API.
**Args:**
- **context (ProcessingContext)**
- **model (FunctionModel)**
- **node_id (str)**
- **messages (typing.Sequence[nodetool.metadata.types.ChatMessageParam])**
- **tools (typing.Sequence[nodetool.chat.tools.Tool]) (default: [])**
- **tool_choice (dict[str, typing.Any]) (default: {})**
- **kwargs**

**Returns:** Message

### default_serializer

**Args:**
- **obj (Any)**

**Returns:** dict

### json_schema_for_column

Create a JSON schema for a column.


**Args:**

- **column (ColumnDef)**: The column definition.


**Returns:**

- **dict**: The JSON schema for the column.
**Args:**
- **column (ColumnDef)**

**Returns:** dict

### message_content_to_openai_content_part

Convert a message content to an OpenAI content part.


**Args:**

- **content (MessageContent)**: The message content to convert.


**Returns:**

- **OpenAIChatCompletionContentPartParam**: The OpenAI content part.
**Args:**
- **content (nodetool.metadata.types.MessageTextContent | nodetool.metadata.types.MessageImageContent | nodetool.metadata.types.MessageAudioContent | nodetool.metadata.types.MessageVideoContent)**

**Returns:** typing.Union[openai.types.chat.chat_completion_content_part_text_param.ChatCompletionContentPartTextParam, openai.types.chat.chat_completion_content_part_image_param.ChatCompletionContentPartImageParam, openai.types.chat.chat_completion_content_part_input_audio_param.ChatCompletionContentPartInputAudioParam]

### message_param

Converts a given message object to the corresponding ChatMessageParam object based on the message role.


**Args:**

- **message (Message)**: The message object to convert.


**Returns:**

- **ChatCompletionMessageParam**: The converted ChatCompletionMessageParam object.


**Raises:**

- **ValueError**: If the message role is unknown.
- **AssertionError**: If the message content or tool call ID is not of the expected type.
**Args:**
- **message (Message)**

**Returns:** ChatMessageParam

### parse_tool_calls

Parse a tool call from a string.
- **Example**: '[{"name": "create_record", "arguments": {"name": "John"}}]

- **[{"name"**: "create_record", "arguments": {"name": "Jane"}}]

- **[{"name"**: "create_record", "arguments": {"name": "Bob"}}]
**Args:**
- **s**

**Returns:** list[nodetool.metadata.types.ToolCall]

### process_messages

Process a message by the given model.
Creates a completion using the provided messages.
If tools are provided, the model may respond with tool calls that need to be executed.
Use process_tool_calls to execute the tool calls if needed.


**Args:**

- **context (ProcessingContext)**: The processing context.
- **messages (list[Message])**: The messages in the thread.
- **model (str)**: The model to use for the completion.
- **provider (Provider)**: The API provider to use for the completion.
- **thread_id (str)**: The ID of the thread the message belongs to.
- **node_id (str)**: The ID of the node making the request.
- **tools (list[Tool], optional)**: The tools to use for the completion. Defaults to [].
- **tool_choice (str, optional)**: Enforce specific tool. Defaults to "auto".


**Returns:**

- **tuple[Message, list[ToolCall]]**: The assistant message and the tool calls.
**Args:**
- **context (ProcessingContext)**
- **messages (typing.Sequence[nodetool.metadata.types.Message])**
- **model (FunctionModel)**
- **node_id (str)**
- **tools (typing.Sequence[nodetool.chat.tools.Tool]) (default: [])**
- **tool_choice (dict[str, str]) (default: {})**
- **kwargs**

**Returns:** Message

### process_tool_calls

Process tool calls in parallel.
Looks up the tool by name and executes the tool's process method.
It is required to call process_tool_responses if you want the chat model to respond to the tool calls.


**Args:**

- **context (ProcessingContext)**: The processing context.
- **tool_calls (list[ToolCall])**: The list of tool calls.
- **columns (list[ColumnDef] | None, optional)**: The list of column definitions for the create_record tool. Defaults to None.


**Returns:**

- **Message**: The assistant message.
**Args:**
- **context (ProcessingContext)**
- **tool_calls (typing.Sequence[nodetool.metadata.types.ToolCall])**
- **tools (typing.Sequence[nodetool.chat.tools.Tool])**

**Returns:** list[nodetool.metadata.types.ToolCall]

### process_tool_responses

Process tool responses by the given chat model.
This is used to let the chat model use the result from the tool calls to generate a response.


**Args:**

- **context (ProcessingContext)**: The processing context.
- **model (FunctionModel)**: The function model.
- **node_id (str)**: The node ID.
- **thread_id (str)**: The thread ID.
- **messages (list[Message])**: The list of messages.
- **tool_responses (Sequence[ToolCall])**: The sequence of tool responses.
- ****kwargs**: Additional keyword arguments.


**Returns:**

The completion created.
**Args:**
- **context (ProcessingContext)**
- **model (FunctionModel)**
- **node_id (str)**
- **thread_id (str)**
- **messages (list[nodetool.metadata.types.Message])**
- **tool_responses (typing.Sequence[nodetool.metadata.types.ToolCall])**
- **kwargs**

### run_tool

Executes a tool call requested by the chat model.


**Args:**

- **context (ProcessingContext)**: The processing context.
- **thread_id (str)**: The ID of the thread.
- **tool_call (ToolCall)**: The tool call object containing the function name and arguments.
- **tools (list[Tool])**: The list of tools to use for the tool call.


**Returns:**

- **ToolCall**: The tool call object containing the function name, arguments, and response.
**Args:**
- **context (ProcessingContext)**
- **tool_call (ToolCall)**
- **tools (typing.Sequence[nodetool.chat.tools.Tool])**

**Returns:** ToolCall

