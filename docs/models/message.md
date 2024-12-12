# nodetool.models.message

## Message

**Fields:**
- **id** (str)
- **thread_id** (str)
- **user_id** (str)
- **tool_call_id** (str | None)
- **role** (str)
- **name** (str)
- **content** (str | list[nodetool.metadata.types.MessageTextContent | nodetool.metadata.types.MessageImageContent | nodetool.metadata.types.MessageAudioContent | nodetool.metadata.types.MessageVideoContent] | None)
- **tool_calls** (list[nodetool.metadata.types.ToolCall] | None)
- **created_at** (datetime)


