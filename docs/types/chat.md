# nodetool.types.chat

## MessageCreateRequest

- **thread_id** (`str | None`)
- **user_id** (`str | None`)
- **tool_call_id** (`str | None`)
- **role** (`str`)
- **name** (`str`)
- **content** (`str | list[nodetool.models.message.MessageTextContent | nodetool.models.message.MessageImageContent] | None`)
- **tool_calls** (`list[nodetool.models.message.ToolCall] | None`)
- **created_at** (`str | None`)

## MessageList

- **next** (`str | None`)
- **messages** (`list[nodetool.metadata.types.Message]`)

## TaskCreateRequest

- **task_type** (`str`)
- **thread_id** (`str`)
- **name** (`str`)
- **instructions** (`str`)
- **dependencies** (`list[str]`)
- **required_capabilities** (`list[str]`)

## TaskList

- **next** (`str | None`)
- **tasks** (`list[nodetool.metadata.types.Task]`)

## TaskUpdateRequest

- **status** (`str | None`)
- **error** (`str | None`)
- **result** (`str | None`)
- **cost** (`float | None`)
- **started_at** (`str | None`)
- **finished_at** (`str | None`)
