# nodetool.types.chat

## MessageCreateRequest

**Fields:**
- **thread_id** (str | None)
- **user_id** (str | None)
- **tool_call_id** (str | None)
- **role** (str)
- **name** (str)
- **content** (str | list[nodetool.metadata.types.MessageTextContent | nodetool.metadata.types.MessageImageContent | nodetool.metadata.types.MessageAudioContent | nodetool.metadata.types.MessageVideoContent | nodetool.metadata.types.MessageDocumentContent] | None)
- **tool_calls** (list[nodetool.metadata.types.ToolCall] | None)
- **created_at** (str | None)
- **workflow** (nodetool.models.workflow.Workflow | None)


## MessageList

**Fields:**
- **next** (str | None)
- **messages** (list)


## TaskCreateRequest

**Fields:**
- **task_type** (str)
- **thread_id** (str)
- **name** (str)
- **instructions** (str)
- **dependencies** (list)


## TaskList

**Fields:**
- **next** (str | None)
- **tasks** (list)


## TaskUpdateRequest

**Fields:**
- **status** (str | None)
- **error** (str | None)
- **result** (str | None)
- **cost** (float | None)
- **started_at** (str | None)
- **finished_at** (str | None)


