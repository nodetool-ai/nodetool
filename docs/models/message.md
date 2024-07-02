# nodetool.models.message

## ImageUrl

**Inherits from:** BaseModel

- **url** (`str`)

## Message

**Inherits from:** DBModel

- **id** (`str`)
- **thread_id** (`str`)
- **user_id** (`str`)
- **tool_call_id** (`str | None`)
- **role** (`str`)
- **name** (`str`)
- **content** (`str | list[nodetool.models.message.MessageTextContent | nodetool.models.message.MessageImageContent] | None`)
- **tool_calls** (`list[nodetool.models.message.ToolCall] | None`)
- **created_at** (`datetime`)

## MessageImageContent

**Inherits from:** BaseModel

- **type** (`typing.Literal['image_url']`)
- **image_url** (`ImageUrl`)

## MessageTextContent

**Inherits from:** BaseModel

- **type** (`typing.Literal['text']`)
- **text** (`str`)

## ToolCall

**Inherits from:** BaseModel

- **id** (`str`)
- **name** (`str`)
- **args** (`dict[str, typing.Any]`)
- **result** (`Any`)

